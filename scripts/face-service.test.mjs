import test from "node:test";
import assert from "node:assert/strict";
import { faceServiceConfig, faceServiceRequest } from "../lib/face-service.mjs";
const env = {
  VERCEL: "1",
  FACE_SERVICE_URL: "https://face.example.com",
  FACE_SERVICE_TOKEN: "test-face-token-at-least-32-characters",
};
test("hosted face service requires HTTPS, a valid base URL and a private token", () => {
  for (const FACE_SERVICE_URL of [
    "",
    "http://face.example.com",
    "https://localhost",
    "https://127.0.0.2",
    "https://user:secret@face.example.com",
    "https://face.example.com?token=x",
  ])
    assert.throws(() => faceServiceConfig({ ...env, FACE_SERVICE_URL }));
  assert.throws(() => faceServiceConfig({ ...env, FACE_SERVICE_TOKEN: "" }));
  assert.equal(faceServiceConfig(env).base, "https://face.example.com");
});
test("server sends the protected capture to the fixed extraction endpoint", async (t) => {
  const body = { model: "test", images: ["synthetic"], poses: ["center"] };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://face.example.com/extract");
    assert.equal(
      options.headers.Authorization,
      `Bearer ${env.FACE_SERVICE_TOKEN}`,
    );
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    assert.deepEqual(JSON.parse(options.body), body);
    return Response.json({ model: "test", embeddings: [] });
  });
  assert.equal((await faceServiceRequest("/extract", body, env)).model, "test");
});
test("only capture errors reach the user verbatim", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { kind: "capture", error: "Nenhum rosto detectado." },
      { status: 422 },
    ),
  );
  await assert.rejects(faceServiceRequest("/extract", {}, env), {
    status: 422,
    message: "Nenhum rosto detectado.",
  });
});
test("infrastructure errors and non-JSON protection pages fail without leaking response data", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "sensitive internal diagnostic" }, { status: 500 }),
  );
  await assert.rejects(
    faceServiceRequest("/health", undefined, env),
    (error) => error.status === 503 && !error.message.includes("sensitive"),
  );
  fetch.mock.mockImplementation(
    async () => new Response("<html>Protected deployment</html>"),
  );
  await assert.rejects(faceServiceRequest("/health", undefined, env), {
    status: 503,
  });
});
test("network failures use a controlled unavailable response", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("network failure");
  });
  await assert.rejects(faceServiceRequest("/health", undefined, env), {
    status: 503,
  });
});
