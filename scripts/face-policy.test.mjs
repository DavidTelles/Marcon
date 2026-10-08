import assert from "node:assert/strict";
import { test } from "node:test";
import { coherentCapture, matchesEnrollment, validImages, FACE_THRESHOLD } from "../lib/face-policy.ts";

const face = Array.from({ length: 128 }, (_, i) => i === 0 ? 1 : 0);
const another = Array.from({ length: 128 }, (_, i) => i === 1 ? 1 : 0);
const enrollment = Array.from({ length: 5 }, () => [...face]);
const login = Array.from({ length: 3 }, () => [...face]);

test("three login samples match existing five-vector credentials without changing identity threshold", () => {
  assert.equal(FACE_THRESHOLD, 0.363);
  assert.equal(matchesEnrollment(login, enrollment, 3), true);
  assert.equal(matchesEnrollment(login, enrollment), false);
  assert.equal(matchesEnrollment([face, face, another], enrollment, 3), false);
  assert.equal(coherentCapture([face, face, another], 3), false);
  assert.equal(coherentCapture(login, 3), true);
});

test("shorter login cannot redefine enrollment size or accept arbitrary frame counts", () => {
  assert.equal(matchesEnrollment(login, login, 3), false);
  assert.equal(matchesEnrollment(enrollment, enrollment, 3), false);
  assert.equal(coherentCapture(enrollment.slice(0, 2), 2), false);
  const frame = "a".repeat(1200);
  assert.equal(validImages(Array(3).fill(frame), 3), true);
  assert.equal(validImages(Array(3).fill(frame)), false);
  assert.equal(validImages(Array(2).fill(frame), 2), false);
  assert.equal(validImages(Array(5).fill(frame), 3), false);
});
