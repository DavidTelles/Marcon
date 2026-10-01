import test from "node:test";
import assert from "node:assert/strict";
import { databaseConfigured } from "../lib/db-config.mjs";

test("somente URLs PostgreSQL ativam o modo persistente", () => {
  assert.equal(databaseConfigured({}), false);
  assert.equal(databaseConfigured({ DATABASE_URL: "" }), false);
  assert.equal(databaseConfigured({ DATABASE_URL: "https://example.test/db" }), false);
  assert.equal(databaseConfigured({ DATABASE_URL: "postgresql://user:pass@host/db" }), true);
});
