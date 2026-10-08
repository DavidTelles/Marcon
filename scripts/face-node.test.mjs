import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { faceEngine, checkNodeFaceEngine, extractNodeFaces } from "../lib/face-node.mjs";
import { acceptsFacePose } from "../lib/face-capture-policy.mjs";

const images = await Promise.all(Array.from({ length: 5 }, async (_, i) =>
  (await sharp("tests/fixtures/ai-face.jpg").resize(640, 640).linear(1, i * 4)
    .jpeg({ quality: 85 }).toBuffer()).toString("base64"),
));
const cosine = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0) /
  Math.sqrt(a.reduce((sum, value) => sum + value * value, 0) * b.reduce((sum, value) => sum + value * value, 0));

test("default hosted engine ignores obsolete Python service settings; remote is explicit", () => {
  assert.equal(faceEngine({ VERCEL: "1", FACE_SERVICE_URL: "https://missing-service.example", FACE_PYTHON: "missing" }), "node");
  assert.equal(faceEngine({ FACE_ENGINE: "remote" }), "remote");
  assert.equal(faceEngine({ FACE_ENGINE: "python" }), "python");
  assert.throws(() => faceEngine({ FACE_ENGINE: "python", VERCEL: "1" }), /hospedagem/);
  assert.throws(() => faceEngine({ FACE_ENGINE: "invalid" }), /hospedagem/);
});

test("bundled CPU models run without FACE_* configuration or Python, including VERCEL=1", async () => {
  const before = { VERCEL: process.env.VERCEL, FACE_SERVICE_URL: process.env.FACE_SERVICE_URL, FACE_SERVICE_TOKEN: process.env.FACE_SERVICE_TOKEN, FACE_PYTHON: process.env.FACE_PYTHON };
  process.env.VERCEL = "1";
  for (const key of ["FACE_SERVICE_URL", "FACE_SERVICE_TOKEN", "FACE_PYTHON"]) delete process.env[key];
  try {
    assert.deepEqual(await checkNodeFaceEngine(), { status: "ok", model: "opencv-yunet-sface-2023mar-v1", dimensions: 128 });
    const vectors = await extractNodeFaces(images);
    assert.equal(vectors.length, 5);
    assert.ok(vectors.every((v) => v.length === 128 && v.every(Number.isFinite)));
    assert.ok(vectors.every((v) => cosine(vectors[0], v) > 0.9));
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("capture validation rejects no face, multiple faces, repeated frames, wrong pose and bad image", async () => {
  const blank = (await sharp({ create: { width: 640, height: 640, channels: 3, background: "#888" } }).jpeg().toBuffer()).toString("base64");
  const source = await sharp("tests/fixtures/ai-face.jpg").resize(640, 640).toBuffer();
  const two = (await sharp({ create: { width: 1280, height: 640, channels: 3, background: "#888" } })
    .composite([{ input: source, left: 0, top: 0 }, { input: source, left: 640, top: 0 }]).jpeg({ quality: 85 }).toBuffer()).toString("base64");
  for (const [samples, poses, message] of [
    [Array(5).fill(blank), undefined, /Nenhum rosto/],
    [Array(5).fill(two), undefined, /Vários rostos/],
    [Array(5).fill(images[0]), undefined, /repetidas/],
    [images, Array(5).fill("left"), /desafio/],
    [Array(5).fill("invalid"), undefined, /inválida/],
    [images, Array(5).fill("invalid"), /posições/],
  ]) {
    await assert.rejects(extractNodeFaces(samples, poses), (error) => error.status === 422 && message.test(error.message));
  }
});

test("640x480 camera frames preserve aspect ratio and satisfy both randomized turn orders", async () => {
  for (const turns of [["left", "right"], ["right", "left"]]) {
    const poses = ["center", turns[0], "center", turns[1], "center"];
    const frames = await Promise.all(poses.map(async (pose, i) =>
      (await sharp(`tests/fixtures/ai-face-${pose}.jpg`).linear(1, i * 4).jpeg({ quality: 85 }).toBuffer()).toString("base64"),
    ));
    const vectors = await extractNodeFaces(frames, poses);
    assert.equal(vectors.length, 5);
    assert.ok(vectors.every((v, i) => vectors.slice(i + 1).every((other) => cosine(v, other) >= 0.363)));
  }
});

test("automatic login needs only three frontal frames; cannot reduce registration or request turns", async () => {
  const vectors = await extractNodeFaces(images.slice(0, 3), undefined, "login");
  assert.equal(vectors.length, 3);
  for (const [frames, poses, purpose] of [
    [images, undefined, "login"], [images.slice(0, 3), undefined, "register"],
    [images.slice(0, 3), Array(3).fill("left"), "login"], [images, undefined, "invalid"],
  ]) await assert.rejects(extractNodeFaces(frames, poses, purpose), error => error.status === 422);
  await assert.rejects(extractNodeFaces(Array(3).fill(images[0]), undefined, "login"), /repetidas/);
});

test("registration accepts gentle turns and relaxed centering, but keeps both direction checks", () => {
  assert.ok(acceptsFacePose(-0.12, "left"));
  assert.ok(acceptsFacePose(0.12, "right"));
  assert.ok(acceptsFacePose(0.30, "center"));
  assert.equal(acceptsFacePose(0, "left"), false);
  assert.equal(acceptsFacePose(0, "right"), false);
  assert.equal(acceptsFacePose(0.12, "left"), false);
  assert.equal(acceptsFacePose(-0.12, "right"), false);
  assert.equal(acceptsFacePose(0.40, "center"), false);
});

test("existing OpenCV enrollments remain compatible with Node SFace vectors", { skip: !process.argv.includes("--compare-python") }, async () => {
  const localPython = join(process.cwd(), "face/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  const python = process.env.FACE_PYTHON || (existsSync(localPython) ? localPython : "python");
  const reference = spawnSync(python, ["face/recognize.py"], {
    input: JSON.stringify({ images }), encoding: "utf8", windowsHide: true, timeout: 30000,
  });
  assert.equal(reference.status, 0, reference.stderr);
  const expected = JSON.parse(reference.stdout).embeddings;
  const actual = await extractNodeFaces(images);
  const similarities = actual.map((vector, i) => cosine(vector, expected[i]));
  console.log("Node / OpenCV cosine similarities:", similarities.map((v) => v.toFixed(6)).join(", "));
  assert.ok(similarities.every((value) => value > 0.99), "Preprocessing must remain compatible with existing encrypted OpenCV vectors.");
});
