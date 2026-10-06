import { spawn } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { FACE_COUNT, FACE_MODEL, validEmbedding } from "./face-policy";
import { faceServiceRequest } from "./face-service.mjs";

export class FaceProcessingError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}

export async function extractFaces(images: string[], poses: string[] = Array(FACE_COUNT).fill("center")): Promise<number[][]> {
  if (process.env.FACE_SERVICE_URL || process.env.VERCEL) {
    const result = await faceServiceRequest("/extract", { model: FACE_MODEL, images, poses });
    if (result?.model !== FACE_MODEL || !Array.isArray(result.embeddings) || result.embeddings.length !== FACE_COUNT || !result.embeddings.every(validEmbedding))
      throw new FaceProcessingError("Resposta do serviço facial inválida.");
    return result.embeddings;
  }
  const localPython = join(process.cwd(), "face", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  const executable = process.env.FACE_PYTHON || (existsSync(localPython) ? localPython : "python");
  const script = join(process.cwd(), "face", "recognize.py");
  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ executable, [script], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, OPENCV_IO_MAX_IMAGE_PIXELS: "2000000" },
    });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new FaceProcessingError("Tempo esgotado na análise facial. Entre com senha."));
    }, 30_000);
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > 100_000) {
        child.kill();
        reject(new FaceProcessingError("Resposta facial inválida."));
      }
    });
    child.stderr.resume();
    child.stdin.on("error", () => { clearTimeout(timeout);child.kill();reject(new FaceProcessingError("Serviço facial indisponível.")); });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(new FaceProcessingError((error as NodeJS.ErrnoException).code === "ENOENT" ? "Python indisponível. Configure FACE_PYTHON." : "Serviço facial indisponível."));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      try {
        const result = JSON.parse(output);
        if (code !== 0 || !Array.isArray(result.embeddings))
          throw new FaceProcessingError(result.error || "Reconhecimento indisponível.", result.kind === "capture" ? 422 : 503);
        if (result.embeddings.length !== FACE_COUNT || !result.embeddings.every(validEmbedding))
          throw new FaceProcessingError("Resposta facial inválida.");
        resolve(result.embeddings);
      } catch (error) {
        reject(error instanceof FaceProcessingError ? error : new FaceProcessingError("Serviço facial indisponível ou resposta inválida."));
      }
    });
    child.stdin.end(JSON.stringify({ images, poses }));
  });
}
