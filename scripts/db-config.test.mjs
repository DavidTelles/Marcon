import test from "node:test";
import assert from "node:assert/strict";
import { databaseConfig, databaseConfigured } from "../lib/db-config.mjs";

test("campos separados preservam senha e têm prioridade sobre URL", () => {
  const env = { DB_NAME: "marcon", DB_USER: "root", DB_PASSWORD: "a@b:c/#$", DATABASE_URL: "inválida" };
  assert.deepEqual(databaseConfig(env), { host: "127.0.0.1", port: 3306, user: "root", password: "a@b:c/#$", database: "marcon" });
  assert.equal(databaseConfig(env, true).database, undefined);
});
test("URL legada e conexão inicial sem schema", () => {
  const env = { DATABASE_URL: "mysql://root:abc@localhost:3306/marcon_test" };
  assert.equal(databaseConfig(env).database, "marcon_test");
  assert.equal(new URL(databaseConfig(env, true).uri).pathname, "/");
});
test("configuração incompleta ou porta inválida falha explicitamente", () => {
  assert.throws(() => databaseConfig({ DB_NAME: "marcon" }), /DB_USER/);
  for (const port of ["abc", "0", "65536", "3.5"]) {
    assert.throws(() => databaseConfig({ DB_NAME: "marcon", DB_USER: "root", DB_PORT: port }), /DB_PORT/);
  }
  assert.throws(() => databaseConfig({ DATABASE_URL: "inválida" }), /DATABASE_URL/);
});
test("sem banco mantém demo, configuração parcial não ativa demo silenciosamente", () => {
  assert.equal(databaseConfigured({}), false);
  assert.equal(databaseConfigured({ DB_NAME: "", DB_USER: "", DATABASE_URL: "" }), false);
  assert.equal(databaseConfigured({ DB_USER: "root" }), true);
});
