import { test, expect } from "@playwright/test";
import { decryptFace, encryptFace } from "../lib/face-crypto";
import {
  matchesEnrollment,
  validateCapture,
  FACE_THRESHOLD,
  similarity,
  type FacePose,
  type FaceSample,
} from "../lib/face-policy";

const poses: FacePose[] = [
  "center",
  "left",
  "center",
  "right",
  "center",
  "light",
];
function captures(): FaceSample[] {
  return poses.map((pose, i) => ({
    embedding: Array.from({ length: 1024 }, (_, j) => Math.sin(j) + i * 0.001),
    yaw: pose === "left" ? -0.2 : pose === "right" ? 0.2 : 0,
    pitch: 0,
    brightness: pose === "light" ? 110 : 100,
    contrast: 30,
    sharpness: 100,
    score: 0.95,
    size: 210,
    faces: 1,
    elapsed: i * 700 + 500,
  }));
}
test("facial: limiar, consenso e recusa de captura ruim ou incoerente", () => {
  const good = captures();
  expect(validateCapture(good, poses)).toBe(true);
  expect(
    matchesEnrollment(
      good,
      good.map((s) => s.embedding),
    ),
  ).toBe(true);
  const stranger = good.map((s) => ({
    ...s,
    embedding: s.embedding.map((n) => n + 5),
  }));
  expect(
    matchesEnrollment(
      stranger,
      good.map((s) => s.embedding),
    ),
  ).toBe(false);
  for (const change of [
    { faces: 2 },
    { brightness: 10 },
    { contrast: 2 },
    { sharpness: 0 },
    { yaw: 1 },
    { size: 80 },
    { score: 0.3 },
    { elapsed: NaN },
    { embedding: [1, 2] },
    { embedding: Array(1024).fill(0) },
  ]) {
    const samples = captures();
    Object.assign(samples[1], change);
    expect(
      validateCapture(samples, poses),
      JSON.stringify(Object.keys(change)),
    ).toBe(false);
  }
  const mixed = captures();
  mixed[2] = stranger[2];
  expect(validateCapture(mixed, poses)).toBe(false);
  const replay = captures();
  replay[1].embedding = replay[0].embedding;
  expect(validateCapture(replay, poses)).toBe(false);
  const wrongTurn = captures();
  wrongTurn[1].yaw = 0.2;
  expect(validateCapture(wrongTurn, poses)).toBe(false);
  const borderline = good[0].embedding.map((n) => n + 5.8 / 32);
  expect(similarity(good[0].embedding, borderline)).toBeCloseTo(
    FACE_THRESHOLD,
    5,
  );
});
test("facial: AES-GCM autentica conteúdo e vínculo ao usuário", () => {
  process.env.SESSION_SECRET = "test-only-secret-for-face-encryption-123456789";
  const vectors = captures().map((s) => s.embedding);
  const encrypted = encryptFace(42, vectors);
  expect(decryptFace(42, encrypted)).toEqual(vectors);
  expect(encrypted.equals(encryptFace(42, vectors))).toBe(false);
  expect(() => decryptFace(43, encrypted)).toThrow();
  encrypted[40] ^= 1;
  expect(() => decryptFace(42, encrypted)).toThrow();
});
