import type { Human, FaceResult } from "@vladmandic/human";
import type { FaceSample } from "./face-policy";

import { faceModelConfig } from "./face-model-config";

let instance: Promise<Human> | undefined;
export function getFaceModel(): Promise<Human> {
  if (!instance)
    instance = (async () => {
      // O export node do pacote exige tfjs-node. Importar explicitamente o
      // bundle ESM evita essa dependência durante o SSR do Next.
      const { Human } =
        await import("../node_modules/@vladmandic/human/dist/human.esm.js");
      const human = new Human(faceModelConfig);
      await human.load();
      if (human.models.loaded().length < 3)
        throw new Error(
          "Não foi possível carregar os modelos locais. Tente novamente ou use sua senha.",
        );
      return human;
    })().catch((error) => {
      instance = undefined;
      throw error;
    });
  return instance;
}

// Serializa inferências inclusive se o usuário sair e reabrir durante detect().
let inference: Promise<unknown> = Promise.resolve();
export function detectFace(human: Human, canvas: HTMLCanvasElement) {
  const result = inference.then(() => human.detect(canvas));
  inference = result.catch(() => undefined);
  return result;
}

export function measureFace(
  face: FaceResult,
  frame: HTMLCanvasElement,
  crop: HTMLCanvasElement,
  elapsed: number,
  faces: number,
): FaceSample {
  crop.width = 128;
  crop.height = 128;
  const ctx = crop.getContext("2d", { willReadFrequently: true })!;
  const [x, y, w, h] = face.box;
  ctx.drawImage(frame, x, y, w, h, 0, 0, 128, 128);
  const pixels = ctx.getImageData(0, 0, 128, 128).data;
  const gray = new Float32Array(128 * 128);
  let sum = 0,
    square = 0,
    lap = 0,
    lapSquare = 0;
  for (let i = 0; i < gray.length; i++) {
    const n =
      0.299 * pixels[i * 4] +
      0.587 * pixels[i * 4 + 1] +
      0.114 * pixels[i * 4 + 2];
    gray[i] = n;
    sum += n;
    square += n * n;
  }
  for (let y = 1; y < 127; y++)
    for (let x = 1; x < 127; x++) {
      const i = y * 128 + x;
      const v =
        4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - 128] - gray[i + 128];
      lap += v;
      lapSquare += v * v;
    }
  const brightness = sum / gray.length;
  return {
    embedding: face.embedding ?? [],
    yaw: face.rotation?.angle.yaw ?? NaN,
    pitch: face.rotation?.angle.pitch ?? NaN,
    brightness,
    contrast: Math.sqrt(Math.max(0, square / gray.length - brightness ** 2)),
    sharpness: lapSquare / (126 * 126) - (lap / (126 * 126)) ** 2,
    score: Math.min(face.boxScore, face.faceScore),
    size: Math.min(w, h),
    faces,
    elapsed,
  };
}

export async function faceRequest<T>(
  body?: object,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      "/api/login/face",
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal,
          }
        : { cache: "no-store", signal },
    );
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new Error(
      "Não foi possível conectar ao servidor local. Tente novamente.",
    );
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || typeof result !== "object")
    throw new Error(
      result?.error ||
        "O servidor retornou uma resposta inválida. Tente novamente.",
    );
  return result as T;
}
