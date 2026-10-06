import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import sharp from "sharp";
import { faceServiceRequest } from "../lib/face-service.mjs";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const localPython = resolve(
  "face/.venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const python =
  process.env.FACE_PYTHON || (existsSync(localPython) ? localPython : "python");
const portProbe = createServer();
await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const env = {
  VERCEL: "",
  FACE_SERVICE_URL: `http://127.0.0.1:${port}`,
  FACE_SERVICE_TOKEN: randomBytes(32).toString("hex"),
};
const child = spawn(
  python,
  ["-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", String(port)],
  {
    cwd: resolve("face"),
    windowsHide: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env, FACE_SERVICE_TOKEN: env.FACE_SERVICE_TOKEN },
  },
);
let startupError;
child.on("error", (error) => {
  startupError = error;
});
try {
  let health;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (startupError) throw startupError;
    if (child.exitCode !== null)
      throw new Error("O serviço Python encerrou durante a inicialização.");
    try {
      health = await faceServiceRequest("/health", undefined, env);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  assert.equal(
    health?.status,
    "ok",
    "Instale face/requirements.txt e configure FACE_PYTHON.",
  );
  assert.equal(health.dimensions, 128);
  const images = await Promise.all(
    Array.from({ length: 5 }, async (_, i) =>
      (
        await sharp("tests/fixtures/ai-face.jpg")
          .resize(640, 640)
          .linear(1, i * 4)
          .jpeg({ quality: 85 })
          .toBuffer()
      ).toString("base64"),
    ),
  );
  const result = await faceServiceRequest(
    "/extract",
    { model: health.model, images, poses: Array(5).fill("center") },
    env,
  );
  assert.equal(result.model, health.model);
  assert.equal(result.embeddings.length, 5);
  assert.ok(
    result.embeddings.every(
      (vector) => vector.length === 128 && vector.every(Number.isFinite),
    ),
  );
  console.log(
    "PASS: Node -> HTTP Python -> modelos reais YuNet/SFace; cinco vetores de 128 dimensões (imagem sintética).",
  );
} finally {
  if (child.exitCode === null && !startupError) {
    const stopped = new Promise((resolve) => child.once("close", resolve));
    child.kill();
    await stopped;
  }
}
