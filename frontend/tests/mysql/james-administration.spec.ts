import { test, expect } from "@playwright/test";
import mysql from "mysql2/promise";
import { databaseConfig } from "../../lib/db-config.mjs";

test("Real admin user forms: corrections, role restriction, duplicates and persistent confirmation", async ({
  request,
}) => {
  const pool = mysql.createPool(databaseConfig()),
    headers = { origin: "http://localhost:3101" };
  const employeeNo = "JADM-" + Date.now().toString(36).toUpperCase();
  let id = 0,
    formToken: string | undefined;
  const keys: string[] = [];
  const login = async (identity: string) =>
    expect(
      (
        await request.post("/api/login", {
          headers,
          data: { identity, password: process.env.SEED_PASSWORD },
        })
      ).status(),
    ).toBe(200);
  const send = async (message: string, status = 200) => {
    const r = await request.post("/api/james/chat", {
      headers,
      data: { message, cart: [], formToken },
    });
    expect(r.status(), await r.text()).toBe(status);
    const d = await r.json();
    if (r.ok()) formToken = d.formToken;
    return d;
  };
  const confirm = async (token: string, status = 200) => {
    keys.push(
      JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString()).key,
    );
    const r = await request.post("/api/james/chat", {
      headers,
      data: { mode: "confirm", token, confirmation: "confirmar acao" },
    });
    expect(r.status(), await r.text()).toBe(status);
    return r.json();
  };
  const row = async () =>
    (
      await pool.execute<mysql.RowDataPacket[]>(
        "SELECT name,email,role,active FROM users WHERE id=?",
        [id],
      )
    )[0][0];
  try {
    const [created] = await pool.execute<mysql.ResultSetHeader>(
      "INSERT INTO users(employee_no,name,email,password_hash,role,sector,block_id) SELECT ?,'James admin teste',?,password_hash,'funcionario','Teste',block_id FROM users WHERE employee_no='1001'",
      [employeeNo, employeeNo.toLowerCase() + "@test.invalid"],
    );
    id = created.insertId;
    for (const identity of ["1001", "1002", "1003"]) {
      await login(identity);
      await send("editar usuário", 403);
    }
    await login("1004");
    let d = await send("editar usuário");
    for (const answer of [
      employeeNo,
      "James pessoa revisada",
      employeeNo.toLowerCase() + "-novo@test.invalid",
      "Manutenção",
      "Funcionário",
      "Bloco A",
      "ativo",
    ])
      d = await send(answer);
    expect((await row()).name).toBe("James admin teste");
    await send("corrigir setor");
    d = await send("Montagem");
    expect(d.confirmationKind).toBe("operation");
    const token = d.confirmationToken;
    await login("1003");
    await confirm(token, 403);
    await login("1004");
    await confirm(token);
    await confirm(token);
    expect((await row()).name).toBe("James pessoa revisada");
    expect(
      (
        await pool.execute<mysql.RowDataPacket[]>(
          "SELECT COUNT(*) total FROM audit_log WHERE entity_type='user' AND entity_id=? AND action='update'",
          [id],
        )
      )[0][0].total,
    ).toBe(1);
    formToken = undefined;
    await send("alterar status de usuário");
    await send(employeeNo);
    d = await send("inativo");
    await confirm(d.confirmationToken);
    expect((await row()).active).toBe(0);
    formToken = undefined;
    await send("alterar status de usuário");
    await send("1004");
    await send("inativo", 403);
  } finally {
    for (const key of new Set(keys))
      await pool.execute(
        "DELETE FROM request_submissions WHERE request_key=?",
        [key],
      );
    if (id) {
      await pool.execute(
        "DELETE FROM audit_log WHERE entity_type='user' AND entity_id=?",
        [id],
      );
      await pool.execute("DELETE FROM users WHERE id=?", [id]);
    }
    await pool.end();
  }
});
