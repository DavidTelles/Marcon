import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { faceModelConfig } from "../lib/face-model-config";
import { FACE_THRESHOLD, similarity } from "../lib/face-policy";

test("Human real: embeddings locais de 1024 dimensões e comparação de imagens sintéticas", async ({
  page,
}) => {
  test.setTimeout(120000);
  // Fixtures de rostos gerados por IA, da coleção MIT do Human:
  // https://github.com/vladmandic/human/tree/main/samples/in
  // Nenhuma imagem de usuário é coletada ou gravada por este teste.
  await page.route("**/__human-test.js", async (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: await readFile("node_modules/@vladmandic/human/dist/human.esm.js"),
    }),
  );
  await page.route("**/__face-test/*.jpg", async (route) =>
    route.fulfill({
      contentType: "image/jpeg",
      body: await readFile(
        `tests/fixtures/${new URL(route.request().url()).pathname.split("/").at(-1)}`,
      ),
    }),
  );
  await page.goto("/login");
  const vectors = await page.evaluate(async (config) => {
    const url = "/__human-test.js";
    const { Human } = await import(url);
    const human = new Human(config);
    await human.load();
    const vectors: number[][] = [];
    for (const [name, brightness] of [
      ["ai-face.jpg", 1],
      ["ai-face.jpg", 0.9],
      ["ai-body.jpg", 1],
    ] as const) {
      const image = new Image();
      image.src = `/__face-test/${name}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = Math.round((640 * image.height) / image.width);
      const c = canvas.getContext("2d")!;
      c.filter = `brightness(${brightness})`;
      c.drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = await human.detect(canvas);
      if (result.face.length !== 1)
        throw new Error(`Fixture ${name}: ${result.face.length} rostos`);
      vectors.push(result.face[0].embedding);
    }
    return vectors;
  }, faceModelConfig);
  expect(
    vectors.every((v) => v.length === 1024 && v.every(Number.isFinite)),
  ).toBe(true);
  expect(similarity(vectors[0], vectors[1])).toBeGreaterThanOrEqual(
    FACE_THRESHOLD,
  );
  expect(similarity(vectors[0], vectors[2])).toBeLessThan(FACE_THRESHOLD);
});
