import { test, expect } from "@playwright/test";
import { decryptFace, encryptFace } from "../lib/face-crypto";
import {
  FACE_THRESHOLD,
  coherentCapture,
  matchesEnrollment,
  similarity,
  validImages,
} from "../lib/face-policy";

const vector = (index = 0) =>
  Array.from({ length: 128 }, (_, i) => (i === index ? 1 : 0));

test("SFace: compara cinco vetores por similaridade cosseno", () => {
  const registered = Array.from({ length: 5 }, () => vector());
  expect(similarity(registered[0], registered[1])).toBe(1);
  expect(similarity(vector(), vector(1))).toBeLessThan(FACE_THRESHOLD);
  expect(matchesEnrollment(registered, registered)).toBe(true);
  expect(coherentCapture(registered)).toBe(true);
  expect(coherentCapture([vector(1), ...registered.slice(1)])).toBe(false);
  expect(
    matchesEnrollment([vector(1), ...registered.slice(1)], registered),
  ).toBe(false);
  expect(matchesEnrollment(registered.slice(1), registered)).toBe(false);
  expect(validImages(Array(5).fill("a".repeat(1200)))).toBe(true);
  expect(validImages(Array(4).fill("a".repeat(1200)))).toBe(false);
});

test("dados faciais permanecem autenticados e vinculados ao usuário", () => {
  process.env.SESSION_SECRET = "test-only-secret-for-face-encryption-123456789";
  const vectors = Array.from({ length: 5 }, () => vector());
  const encrypted = encryptFace(42, vectors);
  expect(decryptFace(42, encrypted)).toEqual(vectors);
  expect(() => decryptFace(43, encrypted)).toThrow();
});
