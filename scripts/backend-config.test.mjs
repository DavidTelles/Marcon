import test from "node:test";
import assert from "node:assert/strict";
import { backendTarget } from "../lib/backend-config.mjs";

test("Vercel uses the embedded backend without a separate URL", () => {
  for (const BACKEND_URL of [undefined, "", "embedded", " embedded "])
    assert.equal(backendTarget({ VERCEL: "1", BACKEND_URL }), null);
});
test("external backend URLs retain base paths and remove trailing slashes", () => {
  assert.equal(
    backendTarget({
      VERCEL: "1",
      BACKEND_URL: " https://api.example.com/backend/// ",
    }),
    "https://api.example.com/backend",
  );
  assert.equal(
    backendTarget({ BACKEND_URL: "http://localhost:3001" }),
    "http://localhost:3001",
  );
});
test("Vercel rejects loopback and insecure backend URLs", () => {
  for (const BACKEND_URL of [
    "http://localhost:3001",
    "https://localhost",
    "https://127.0.0.1",
    "https://127.0.0.2",
    "https://[::1]",
    "https://0.0.0.0",
    "http://api.example.com",
  ])
    assert.throws(
      () => backendTarget({ VERCEL: "1", BACKEND_URL }),
      /Na Vercel/,
    );
});
test("reject malformed URLs and credentials, queries or fragments", () => {
  for (const BACKEND_URL of [
    "api.example.com",
    "ftp://api.example.com",
    "https://user:password@example.com",
    "https://example.com?token=abc",
    "https://example.com/#login",
  ])
    assert.throws(() => backendTarget({ BACKEND_URL }), /BACKEND_URL inválida/);
});
test("reject a backend URL pointing at the frontend and causing health recursion", () => {
  assert.throws(() => backendTarget({ VERCEL: "1", BACKEND_URL: "https://marcon-ten.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "marcon-ten.vercel.app" }), /próprio frontend/);
  assert.equal(backendTarget({ VERCEL: "1", BACKEND_URL: "https://api.example.com", VERCEL_PROJECT_PRODUCTION_URL: "marcon-ten.vercel.app" }), "https://api.example.com");
});
