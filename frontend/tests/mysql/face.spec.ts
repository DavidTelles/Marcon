import { expect, test, type APIRequestContext } from "@playwright/test";
import mysql, {
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import { createHash } from "node:crypto";
import { databaseConfig } from "../../lib/db-config.mjs";
import { hashPassword } from "../../lib/password";
import { FACE_CONSENT, FACE_MODEL, type FacePose } from "../../lib/face-policy";

const password = "LocalFace-Test!2026";
function samples(poses: FacePose[], offset = 0) {
  return poses.map((pose, i) => ({
    embedding: Array.from(
      { length: 1024 },
      (_, j) => Math.sin(j) + i * 0.001 + offset,
    ),
    yaw: pose === "left" ? -0.2 : pose === "right" ? 0.2 : 0,
    pitch: 0,
    brightness: pose === "light" ? 110 : 100,
    contrast: 30,
    sharpness: 100,
    score: 0.95,
    size: 210,
    faces: 1,
    elapsed: i * 700 + 500,
  }));
}
// Vetores sintéticos exercitam o protocolo e a decisão do servidor, não a
// precisão biométrica. Não existe bypass/test mode no código da aplicação.
test("facial MySQL: cadastro, sessão, rejeição, replay, limite, exclusão e recadastro", async ({
  playwright,
  baseURL,
}) => {
  const pool = mysql.createPool(databaseConfig());
  const identity = `face_${Date.now()}`;
  const contexts: APIRequestContext[] = [];
  let id: number | undefined;
  const client = async () => {
    const c = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { origin: baseURL! },
    });
    contexts.push(c);
    return c;
  };
  const action = (c: APIRequestContext, body: object) =>
    c.post("/api/login/face", { data: body });
  async function begin(c: APIRequestContext, purpose: string) {
    const r = await action(c, {
      action: "start",
      purpose,
      identity,
      password,
      consent: FACE_CONSENT,
    });
    expect(r.status(), await r.text()).toBe(200);
    // Avança apenas a idade do desafio desta conta de teste, evitando sleeps.
    await pool.execute(
      "UPDATE face_challenges SET created_at = UTC_TIMESTAMP(3) - INTERVAL 10 SECOND WHERE user_id = ?",
      [id!],
    );
    return (await r.json()).poses as FacePose[];
  }
  try {
    const [insert] = await pool.execute<ResultSetHeader>(
      "INSERT INTO users (employee_no,name,email,password_hash,role,sector) VALUES (?, 'Teste facial', ?, ?, 'admin', 'Teste')",
      [identity, `${identity}@example.test`, hashPassword(password)],
    );
    id = insert.insertId;
    const owner = await client();
    expect(
      (
        await owner.post("/api/login", { data: { identity, password } })
      ).status(),
    ).toBe(200);
    expect(
      (
        await action(owner, { action: "start", purpose: "register", password })
      ).status(),
    ).toBe(400);
    let poses = await begin(owner, "register");
    const enroll = {
      action: "finish",
      model: FACE_MODEL,
      samples: samples(poses),
    };
    expect((await action(owner, enroll)).status()).toBe(200);
    expect((await action(owner, enroll)).status()).toBe(400);
    const [stored] = await pool.execute<RowDataPacket[]>(
      "SELECT * FROM face_credentials WHERE user_id = ?",
      [id],
    );
    expect(stored[0].consent_version).toBe(FACE_CONSENT);
    expect(stored[0].embeddings.includes(Buffer.from("embedding"))).toBe(false);
    expect((await owner.get("/api/login/face")).ok()).toBe(true);
    const guest = await client();
    poses = await begin(guest, "login");
    expect(
      (
        await action(guest, {
          action: "finish",
          recognized: true,
          model: FACE_MODEL,
        })
      ).status(),
    ).toBe(422);
    expect((await guest.get("/api/profile")).status()).toBe(401);
    poses = await begin(guest, "login");
    expect(
      (
        await action(guest, {
          action: "finish",
          model: FACE_MODEL,
          samples: samples(poses, 5),
        })
      ).status(),
    ).toBe(401);
    expect((await guest.get("/api/profile")).status()).toBe(401);
    poses = await begin(guest, "login");
    const valid = {
      action: "finish",
      model: FACE_MODEL,
      samples: samples(poses),
    };
    const parallel = await Promise.all([
      action(guest, valid),
      action(guest, valid),
    ]);
    expect(parallel.map((r) => r.status()).sort()).toEqual([200, 400]);
    expect((await guest.get("/api/profile")).status()).toBe(200);
    expect((await action(guest, valid)).status()).toBe(400);
    await begin(guest, "login");
    await begin(guest, "login");
    expect(
      (
        await action(guest, {
          action: "start",
          purpose: "login",
          identity: `${identity}@example.test`,
        })
      ).status(),
    ).toBe(429);
    expect(
      (
        await guest.post("/api/login", { data: { identity, password } })
      ).status(),
    ).toBe(200);
    // Um desafio pendente de cadastro não pode ressuscitar os dados excluídos.
    poses = await begin(owner, "register");
    const pending = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { origin: baseURL! },
      storageState: await owner.storageState(),
    });
    contexts.push(pending);
    expect((await action(owner, { action: "delete", password })).status()).toBe(
      200,
    );
    expect(
      (
        await action(pending, {
          action: "finish",
          model: FACE_MODEL,
          samples: samples(poses),
        })
      ).status(),
    ).toBe(400);
    expect((await (await owner.get("/api/login/face")).json()).enrolled).toBe(
      false,
    );
    poses = await begin(owner, "register");
    expect(
      (
        await action(owner, {
          action: "finish",
          model: FACE_MODEL,
          samples: samples(poses),
        })
      ).status(),
    ).toBe(200);
  } finally {
    if (id) {
      await pool.execute("DELETE FROM users WHERE id = ?", [id]);
      for (const prefix of ["manage", "login"])
        await pool.execute(
          "DELETE FROM auth_attempts WHERE identity_digest = ?",
          [createHash("sha256").update(`face:${prefix}:${id}`).digest()],
        );
    }
    await Promise.all(contexts.map((c) => c.dispose()));
    await pool.end();
  }
});
