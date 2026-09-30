import { spawn } from "node:child_process";
import { join } from "node:path";

export async function extractFaces(images: string[]): Promise<number[][]> {
  const executable = process.env.FACE_PYTHON || "python";
  const script = join(process.cwd(), "face", "recognize.py");
  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ executable, [script], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Tempo esgotado na análise facial."));
    }, 30_000);
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > 100_000) {
        child.kill();
        reject(new Error("Resposta facial inválida."));
      }
    });
    child.stderr.resume();
    child.stdin.on("error", (error) => reject(error));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      try {
        const result = JSON.parse(output);
        if (code !== 0 || !Array.isArray(result.embeddings))
          throw new Error(result.error || "Reconhecimento indisponível.");
        resolve(result.embeddings);
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(JSON.stringify({ images }));
  });
}
