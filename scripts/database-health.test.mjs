import test from "node:test";
import assert from "node:assert/strict";
import { databaseHealth } from "../lib/database-health.mjs";

test("readiness fails when the database cannot be reached", async () => {
  assert.equal(
    await databaseHealth({
      query: async () => {
        throw new Error("network");
      },
    }),
    "disconnected",
  );
});
test("readiness distinguishes a working connection from missing application tables", async () => {
  let queries = 0;
  assert.equal(
    await databaseHealth({
      query: async () => {
        if (queries++ > 0) throw new Error("missing table");
        return [[]];
      },
    }),
    "schema-unavailable",
  );
});
test("readiness succeeds with a compatible login and stock schema", async () => {
  const queries = [];
  assert.equal(
    await databaseHealth({
      query: async (sql) => {
        queries.push(sql);
        return [[]];
      },
    }),
    "connected",
  );
  assert.ok(queries.every((sql) => sql.startsWith("SELECT ")));
});
