import { expect, test } from "@playwright/test";
import mysql from "mysql2/promise";
import { databaseConfig } from "../../lib/db-config.mjs";
import { FACE_CONSENT } from "../../lib/face-policy";

const origin = "http://localhost:3101";
test("Admin cadastra usuário em página própria, preserva filtros e biometria é opcional", async ({
  page,
  playwright,
}) => {
  const suffix = Date.now().toString(36),
    id = "new_" + suffix,
    email = id + "@example.test",
    pool = mysql.createPool(databaseConfig());
  try {
    expect(
      (
        await page.request.post("/api/login", {
          headers: { origin },
          data: { identity: "1004", password: process.env.SEED_PASSWORD },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/admin/create?id=1001&status=Ativos");
    await expect(page.getByPlaceholder("Buscar ID")).toHaveValue("1001");
    await page.getByRole("link", { name: "Novo usuário" }).click();
    await expect(page).toHaveURL(/\/admin\/create\/new/);
    await expect(
      page.getByRole("heading", { name: "Novo usuário" }),
    ).toBeVisible();
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 850 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBeTruthy();
    }
    await page.getByLabel("Matrícula / ID").fill("inválido espaço");
    await page.getByRole("button", { name: "Salvar usuário" }).click();
    await expect(
      page.getByText("Use até 30 letras, números, _ ou -."),
    ).toBeVisible();
    await page.getByLabel("Matrícula / ID").fill(id);
    await page.getByLabel("Nome completo").fill("Funcionário Teste");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Setor").fill("Qualidade");
    await page
      .getByLabel("Senha", { exact: true })
      .fill(process.env.SEED_PASSWORD!);
    await page.getByLabel("Confirmar senha").fill(process.env.SEED_PASSWORD!);
    await page.getByRole("button", { name: "Salvar usuário" }).click();
    await expect(
      page.getByRole("heading", { name: "Usuário cadastrado" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Iniciar cadastro facial" }),
    ).toBeDisabled();
    const [face] = await pool.query(
      "SELECT user_id FROM face_credentials f JOIN users u ON u.id=f.user_id WHERE u.employee_no=?",
      [id],
    );
    expect(face).toHaveLength(0);
    const facialStart = await page.request.post("/api/login/face", {
      headers: { origin },
      data: {
        action: "start",
        purpose: "register",
        adminTarget: id,
        consent: FACE_CONSENT,
      },
    });
    expect(facialStart.status(), await facialStart.text()).toBe(200);
    const [challenge] = await pool.query(
      "SELECT c.user_id FROM face_challenges c JOIN users u ON u.id=c.user_id WHERE u.employee_no=?",
      [id],
    );
    expect(challenge).toHaveLength(1);
    await page.getByRole("button", { name: "Pular e voltar à lista" }).click();
    await expect(page).toHaveURL(/id=1001/);
    await expect(page.getByPlaceholder("Buscar ID")).toHaveValue("1001");
    const duplicate = await page.request.post("/api/workspace", {
      headers: { origin },
      data: {
        type: "saveUser",
        password: process.env.SEED_PASSWORD,
        user: {
          id,
          name: "Duplicado",
          email: "outro_" + email,
          sector: "Teste",
          role: "Funcionário",
          block: "Bloco A",
          active: true,
        },
      },
    });
    expect(duplicate.status()).toBe(409);
    expect(await duplicate.text()).toContain("matrícula");
    const duplicateEmail = await page.request.post("/api/workspace", {
      headers: { origin },
      data: {
        type: "saveUser",
        password: process.env.SEED_PASSWORD,
        user: {
          id: "other_" + suffix,
          name: "Duplicado",
          email,
          sector: "Teste",
          role: "Funcionário",
          block: "Bloco A",
          active: true,
        },
      },
    });
    expect(duplicateEmail.status()).toBe(409);
    expect(await duplicateEmail.text()).toContain("e-mail");
    const employee = await playwright.request.newContext({
      baseURL: origin,
      extraHTTPHeaders: { origin },
    });
    expect(
      (
        await employee.post("/api/login", {
          data: { identity: id, password: process.env.SEED_PASSWORD },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await employee.post("/api/workspace", {
          data: {
            type: "saveUser",
            password: process.env.SEED_PASSWORD,
            user: {
              id: "forbidden",
              name: "Admin indevido",
              email: "forbidden@example.test",
              sector: "Teste",
              role: "Administrador",
              active: true,
            },
          },
        })
      ).status(),
    ).toBe(403);
    await employee.dispose();
  } finally {
    await pool.execute("DELETE FROM users WHERE employee_no IN (?,?)", [
      id,
      "other_" + suffix,
    ]);
    await pool.end();
  }
});

test("avisa alterações não salvas e falha da câmera não remove usuário", async ({
  page,
}) => {
  const suffix = Date.now().toString(36),
    id = "cam_" + suffix,
    pool = mysql.createPool(databaseConfig());
  try {
    expect(
      (
        await page.request.post("/api/login", {
          headers: { origin },
          data: { identity: "1004", password: process.env.SEED_PASSWORD },
        })
      ).status(),
    ).toBe(200);
    await page.goto(
      "/admin/create/new?return=%2Fadmin%2Fcreate%3Frole%3DFuncion%C3%A1rio",
    );
    await page.getByLabel("Nome completo").fill("Alterado");
    page.once("dialog", async (d) => {
      expect(d.message()).toContain("não salvas");
      await d.dismiss();
    });
    await page.getByRole("button", { name: "Voltar para usuários" }).click();
    await expect(page).toHaveURL(/\/new/);
    await page.getByLabel("Matrícula / ID").fill(id);
    await page.getByLabel("Nome completo").fill("Teste Câmera");
    await page.getByLabel("E-mail").fill(id + "@example.test");
    await page.getByLabel("Setor").fill("Teste");
    await page
      .getByLabel("Senha", { exact: true })
      .fill(process.env.SEED_PASSWORD!);
    await page.getByLabel("Confirmar senha").fill(process.env.SEED_PASSWORD!);
    await page.getByRole("button", { name: "Salvar usuário" }).click();
    await page.evaluate(() =>
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: () =>
            Promise.reject(
              Object.assign(new Error("denied"), { name: "NotAllowedError" }),
            ),
        },
      }),
    );
    await page
      .getByText("O funcionário presente autoriza", { exact: false })
      .click();
    await page.getByRole("button", { name: "Iniciar cadastro facial" }).click();
    await expect(page.locator(".staff-face-step [role=alert]")).toContainText(
      "Permita o acesso à câmera",
      { timeout: 30000 },
    );
    const [users] = await pool.query(
      "SELECT id FROM users WHERE employee_no=?",
      [id],
    );
    expect(users).toHaveLength(1);
  } finally {
    await pool.execute("DELETE FROM users WHERE employee_no=?", [id]);
    await pool.end();
  }
});
