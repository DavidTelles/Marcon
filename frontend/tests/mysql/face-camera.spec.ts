import { test, expect } from "@playwright/test";
import mysql, { type ResultSetHeader } from "mysql2/promise";
import { databaseConfig } from "../../lib/db-config.mjs";
import { hashPassword } from "../../lib/password";
import { createHash } from "node:crypto";

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});
test("câmera: modelos locais, ausência de rosto e encerramento ao cancelar", async ({
  page,
  context,
  baseURL,
}) => {
  const pool = mysql.createPool(databaseConfig());
  const identity = `camera_${Date.now()}`,
    password = "Camera-Test!2026";
  let id: number | undefined;
  const external: string[] = [],
    models: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith("http") && !r.url().startsWith(baseURL!))
      external.push(r.url());
    if (r.url().includes("/models/human/")) models.push(r.url());
  });
  await context.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    const state = window as typeof window & {
      testCameraTracks: MediaStreamTrack[];
    };
    state.testCameraTracks = [];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      state.testCameraTracks.push(...stream.getTracks());
      return stream;
    };
  });
  try {
    const [r] = await pool.execute<ResultSetHeader>(
      "INSERT INTO users (employee_no,name,email,password_hash,role,sector) VALUES (?, 'Teste câmera', ?, ?, 'admin', 'Teste')",
      [identity, `${identity}@example.test`, hashPassword(password)],
    );
    id = r.insertId;
    await page.goto("/login");
    expect(models).toHaveLength(0);
    expect(
      await page.evaluate(
        async ({ identity, password }) =>
          (
            await fetch("/api/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ identity, password }),
            })
          ).status,
        { identity, password },
      ),
    ).toBe(200);
    await page.goto("/profile");
    const section = page.getByRole("region", {
      name: "Reconhecimento facial local",
    });
    await expect(
      section.getByRole("button", { name: "Cadastrar rosto", exact: true }),
    ).toBeDisabled();
    await section
      .getByLabel("Senha atual para cadastrar ou excluir")
      .fill(password);
    await section.getByRole("checkbox").check();
    await section
      .getByRole("button", { name: "Cadastrar rosto", exact: true })
      .click();
    await page.getByRole("button", { name: "Iniciar captura" }).click();
    await expect(
      page.getByText("Mantenha apenas um rosto visível na câmera."),
    ).toBeVisible({ timeout: 90000 });
    expect(models.some((url) => url.endsWith("/faceres.bin"))).toBe(true);
    expect(external).toEqual([]);
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    expect(
      await page.evaluate(() =>
        (
          window as typeof window & { testCameraTracks: MediaStreamTrack[] }
        ).testCameraTracks.every((t) => t.readyState === "ended"),
      ),
    ).toBe(true);
    await expect(
      section.getByRole("button", { name: "Cadastrar rosto", exact: true }),
    ).toBeVisible();
    const modelCount = models.length;
    await section
      .getByRole("button", { name: "Cadastrar rosto", exact: true })
      .click();
    await page.getByRole("button", { name: "Iniciar captura" }).click();
    await expect(
      page.getByText("Mantenha apenas um rosto visível na câmera."),
    ).toBeVisible();
    expect(models.length).toBe(modelCount);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(
      page.getByText("Captura interrompida. Inicie novamente."),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        (
          window as typeof window & { testCameraTracks: MediaStreamTrack[] }
        ).testCameraTracks.every((t) => t.readyState === "ended"),
      ),
    ).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: false,
      });
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException("Negado", "NotAllowedError");
      };
    });
    await page.getByRole("button", { name: "Iniciar captura" }).click();
    await expect(section.getByRole("alert")).toContainText(
      "Permita o acesso à câmera",
    );
  } finally {
    await page.goto("about:blank");
    if (id) {
      await pool.execute("DELETE FROM users WHERE id = ?", [id]);
      await pool.execute("DELETE FROM auth_attempts WHERE identity_digest = ?", [createHash("sha256").update(`face:manage:${id}`).digest()]);
    }
    await pool.end();
  }
});
