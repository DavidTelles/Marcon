import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupEnv } from "./setup-env.mjs";

test("setup repairs missing JWT without changing existing configuration and is idempotent", () => {
  const root = mkdtempSync(join(tmpdir(), "marcon-env-"));
  try {
    const original = `DATABASE_URL=postgresql://example/db\nSESSION_SECRET=${"s".repeat(40)}\n`;
    writeFileSync(join(root, ".env"), original);
    setupEnv(root);
    const repaired = readFileSync(join(root, ".env"), "utf8");
    assert.ok(repaired.startsWith(original));
    assert.match(repaired, /^JWT_SECRET=[a-f0-9]{64}$/m);
    setupEnv(root);
    assert.equal(readFileSync(join(root, ".env"), "utf8"), repaired);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("setup replaces placeholder secrets on first installation", () => {
  const root = mkdtempSync(join(tmpdir(), "marcon-env-"));
  try {
    writeFileSync(join(root, ".env.example"), "SESSION_SECRET=troque_um_segredo_aleatorio_com_pelo_menos_32_caracteres\nJWT_SECRET=gere-um-segredo-aleatorio-longo-para-o-backend\n");
    setupEnv(root);
    const content = readFileSync(join(root, ".env"), "utf8");
    assert.match(content, /^SESSION_SECRET=[a-f0-9]{64}$/m);
    assert.match(content, /^JWT_SECRET=[a-f0-9]{64}$/m);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
