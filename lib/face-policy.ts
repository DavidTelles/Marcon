// OpenCV YuNet + SFace from the supplied Python prototype.
import { FACE_REGISTER_COUNT, FACE_LOGIN_COUNT } from "./face-capture-policy.mjs";
export { FACE_LOGIN_COUNT, faceCapturePolicy, captureDelayMs } from "./face-capture-policy.mjs";
export type FacePurpose = "register" | "login";
export const FACE_MODEL = "opencv-yunet-sface-2023mar-v1";
export const FACE_THRESHOLD = 0.363;
export const FACE_CONSENT = "server-face-v2";
export const FACE_TTL = 120_000;
export const FACE_COUNT = FACE_REGISTER_COUNT;
const validCount = (count: number) => count === FACE_COUNT || count === FACE_LOGIN_COUNT;

export function validEmbedding(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 128 &&
    value.every(
      (n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 100,
    )
  );
}

export function similarity(a: number[], b: number[]): number {
  if (!validEmbedding(a) || !validEmbedding(b)) return -1;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < 128; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa > 0 && bb > 0 ? dot / Math.sqrt(aa * bb) : -1;
}

export function validImages(value: unknown, count = FACE_COUNT): value is string[] {
  return (
    Array.isArray(value) &&
    validCount(count) && value.length === count &&
    value.every(
      (image) =>
        typeof image === "string" &&
        image.length > 1000 &&
        image.length <= 300000 &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(image),
    )
  );
}

export function matchesEnrollment(
  samples: number[][],
  enrolled: number[][],
  count = FACE_COUNT,
): boolean {
  if (
    !validCount(count) || samples.length !== count ||
    enrolled.length !== FACE_COUNT ||
    !samples.every(validEmbedding) ||
    !enrolled.every(validEmbedding)
  )
    return false;
  return samples.every((sample) =>
    enrolled.some(
      (reference) => similarity(sample, reference) >= FACE_THRESHOLD,
    ),
  );
}

export function coherentCapture(samples: number[][], count = FACE_COUNT): boolean {
  if (!validCount(count) || samples.length !== count || !samples.every(validEmbedding))
    return false;
  return samples.every((sample, index) =>
    samples
      .slice(index + 1)
      .every((other) => similarity(sample, other) >= FACE_THRESHOLD),
  );
}
