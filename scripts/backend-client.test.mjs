import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Exercise the actual server client without a Next request context.
const filename = fileURLToPath(new URL("../lib/backend-client.ts", import.meta.url));
const compiled = new Module(filename);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(dirname(filename));
compiled._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { backendFetch } = compiled.exports;
const originalUrl = process.env.BACKEND_URL;
const originalVercel = process.env.VERCEL;
afterEach(() => {
  if (originalUrl === undefined) delete process.env.BACKEND_URL;
  else process.env.BACKEND_URL = originalUrl;
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
});
function external() {
  process.env.BACKEND_URL = "https://backend.example.com";
  process.env.VERCEL = "1";
}
test("external transport forwards JWT, body and query and unwraps the API envelope", async t => {
  external();
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://backend.example.com/api/workspace/actions?mode=all");
    assert.equal(options.headers.Authorization, "Bearer test-token");
    assert.equal(options.body, JSON.stringify({ type: "unknown" }));
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    return Response.json({ ok: true, data: { saved: true } });
  });
  assert.deepEqual(await backendFetch("/api/workspace/actions?mode=all", { method: "POST", token: "test-token", body: { type: "unknown" } }), { saved: true });
});
test("backend failures preserve status codes and messages", async t => {
  external();
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Token expirado" }, { status: 401 }));
  await assert.rejects(backendFetch("/api/workspace/snapshot"), { status: 401, message: "Token expirado" });
});
test("frontend HTML mistaken for a backend is rejected explicitly", async t => {
  external();
  t.mock.method(globalThis, "fetch", async () => new Response("<html>Login</html>"));
  await assert.rejects(backendFetch("/login"), error => error.status === 502 && error.message.includes("BACKEND_URL"));
});
test("network errors become a service-unavailable response", async t => {
  external();
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("fetch failed"); });
  await assert.rejects(backendFetch("/login"), { status: 503 });
});
test("invalid Vercel configuration is reported before any network call", async t => {
  external();
  process.env.BACKEND_URL = "http://localhost:3001";
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected call"); });
  await assert.rejects(backendFetch("/login"), error => error.status === 503 && error.message.includes("localhost"));
  assert.equal(fetch.mock.callCount(), 0);
});
