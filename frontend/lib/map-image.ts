import sharp from "sharp";
import path from "node:path";
import { obstacleGrid, suggestGraph, type MapText } from "./map-suggestions";
import type { FacilityGraph } from "./routing";
import { ActionError } from "./permissions";
export async function imageObstacles(image: Buffer) {
  const { data, info } = await sharp(image, { limitInputPixels: 16_000_000 })
    .flatten({ background: "#fff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return obstacleGrid(data, info.width, info.height);
}
let analyzing = false;
export async function imageSuggestions(image: Buffer, base: FacilityGraph) {
  if (analyzing)
    throw new ActionError(
      "Outra planta está em análise. Tente novamente em instantes.",
      429,
    );
  analyzing = true;
  const texts: MapText[] = [];
  let ocr = "OCR local concluído.";
  try {
    const { createWorker, PSM } = await import("tesseract.js");
    const worker = await createWorker("por", 1, {
      langPath: path.join(
        process.cwd(),
        "node_modules/@tesseract.js-data/por/4.0.0",
      ),
      cacheMethod: "none",
      errorHandler: () => {},
    });
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      const input = await sharp(image)
        .resize({
          width: 1800,
          height: 1800,
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: "#fff" })
        .png()
        .toBuffer();
      const meta = await sharp(input).metadata();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("OCR expirou")), 45000);
      });
      try {
        const result = await Promise.race([
          worker.recognize(input, {}, { blocks: true }),
          timeout,
        ]);
        for (const b of result.data.blocks ?? [])
          for (const p of b.paragraphs)
            for (const l of p.lines)
              texts.push({
                text: l.text,
                confidence: l.confidence,
                x: (l.bbox.x0 + l.bbox.x1) / 2 / meta.width!,
                y: (l.bbox.y0 + l.bbox.y1) / 2 / meta.height!,
              });
      } finally {
        clearTimeout(timer);
      }
    } finally {
      await worker.terminate();
    }
  } catch {
    ocr =
      "OCR indisponível ou sem leitura confiável. Edite os nomes manualmente.";
  }
  try {
    return {
      graph: suggestGraph(base, await imageObstacles(image), texts),
      texts: texts.slice(0, 100),
      ocr,
      warning:
        "Sugestões heurísticas e incertas. Textos, móveis, sombras e paredes pouco contrastadas podem causar erros; revise cada ligação e tipo antes de publicar.",
    };
  } finally {
    analyzing = false;
  }
}
