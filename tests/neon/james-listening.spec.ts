import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = {
      availability: "unavailable",
      starts: 0,
      aborted: 0,
      installed: 0,
      local: false,
      hidden: false,
      deferred: false,
      finish: null as null | (() => void),
      current: null as unknown as Recognition,
    };
    class Recognition {
      processLocally = true;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      static available() {
        return Promise.resolve(state.availability);
      }
      static install() {
        state.installed++;
        if (state.deferred)
          return new Promise<boolean>((resolve) => {
            state.finish = () => {
              state.availability = "available";
              resolve(true);
            };
          });
        state.availability = "available";
        return Promise.resolve(true);
      }
      start() {
        state.current = this;
        state.local = this.processLocally;
        state.starts++;
        this.onstart?.();
      }
      abort() {
        state.aborted++;
      }
    }
    Object.defineProperty(Recognition.prototype, "processLocally", {
      value: true,
      writable: true,
    });
    Object.defineProperty(window, "SpeechRecognition", {
      value: Recognition,
      configurable: true,
    });
    Object.defineProperty(window, "voiceTest", { value: state });
    Object.defineProperty(document, "hidden", {
      get: () => state.hidden,
      configurable: true,
    });
  });
  await page.request.post("/api/login", {
    headers: { origin: "http://localhost:3101" },
    data: { identity: "1001", password: process.env.SEED_PASSWORD },
  });
  await page.goto("/employee/request");
  await page.getByRole("button", { name: "Abrir James" }).click();
});

// Controlled browser events exercise the UI lifecycle, not physical speech recognition.
test("unavailable Portuguese: explicit online choice, continuous silence, close, visibility, stop and logout", async ({
  page,
}, info) => {
  await page
    .getByRole("button", { name: "Ativar escuta", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "não oferece português local",
  );
  await expect(
    page.getByRole("button", { name: "Instalar português local" }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/inclusive antes de você dizer James/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { voiceTest: { starts: number } }).voiceTest
          .starts,
    ),
  ).toBe(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: info.outputPath("online-choice.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Ativar voz online" }).click();
  await expect(page.getByRole("status")).toContainText(
    "serviço de voz do navegador",
  );
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { voiceTest: { local: boolean } }).voiceTest
          .local,
    ),
  ).toBe(false);
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => {
      const s = (
        window as unknown as {
          voiceTest: {
            current: {
              onerror: (e: { error: string }) => void;
              onend: () => void;
            };
          };
        }
      ).voiceTest;
      s.current.onerror({ error: "no-speech" });
      s.current.onend();
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { voiceTest: { starts: number } }).voiceTest
              .starts,
        ),
      )
      .toBeGreaterThanOrEqual(i + 2);
    await expect(page.getByRole("status")).toContainText(
      "serviço de voz do navegador",
    );
  }
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { voiceTest: { starts: number } }).voiceTest
          .starts,
    ),
  ).toBeGreaterThanOrEqual(7);
  await page.getByRole("button", { name: "Fechar James" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir James" })).toContainText(
    "escuta online ativa",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("button", { name: "Minhas requisições" })
    .click();
  await expect(page).toHaveURL(/\/employee\/history/);
  await expect(page.getByRole("button", { name: "Abrir James" })).toContainText(
    "escuta online ativa",
  );
  await page.evaluate(() => {
    (window as unknown as { voiceTest: { hidden: boolean } }).voiceTest.hidden =
      true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("button", { name: "Abrir James" })).toContainText(
    "em espera",
  );
  await page.evaluate(() => {
    (window as unknown as { voiceTest: { hidden: boolean } }).voiceTest.hidden =
      false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("button", { name: "Abrir James" })).toContainText(
    "escuta online ativa",
  );
  await page
    .getByRole("button", { name: "Desligar escuta", exact: true })
    .click();
  const stopped = await page.evaluate(
    () =>
      (window as unknown as { voiceTest: { starts: number } }).voiceTest.starts,
  );
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await page.waitForTimeout(700);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { voiceTest: { starts: number } }).voiceTest
          .starts,
    ),
  ).toBe(stopped);
  await page.getByRole("button", { name: "Abrir James" }).click();
  await page
    .getByRole("button", { name: "Ativar escuta", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "serviço de voz do navegador",
  );
  await page.request.post("/api/logout", {
    headers: { origin: "http://localhost:3101" },
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("button", { name: "Abrir James" })).toHaveCount(
    0,
  );
  const afterLogout = await page.evaluate(
    () =>
      (window as unknown as { voiceTest: { starts: number; aborted: number } })
        .voiceTest,
  );
  expect(afterLogout.aborted).toBeGreaterThan(0);
});

test("downloadable package installs and starts locally, permission refusal stays stopped", async ({
  page,
}) => {
  await page.evaluate(() => {
    (
      window as unknown as { voiceTest: { availability: string } }
    ).voiceTest.availability = "downloadable";
  });
  await page
    .getByRole("button", { name: "Ativar escuta", exact: true })
    .click();
  await page.getByRole("button", { name: "Instalar português local" }).click();
  await expect(page.getByRole("status")).toContainText("Ouvindo localmente");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { voiceTest: { local: boolean } }).voiceTest
          .local,
    ),
  ).toBe(true);
  await page.evaluate(() =>
    (
      window as unknown as {
        voiceTest: { current: { onerror: (e: { error: string }) => void } };
      }
    ).voiceTest.current.onerror({ error: "not-allowed" }),
  );
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "not-allowed",
  );
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(
    page.getByRole("button", { name: "Ativar escuta", exact: true }),
  ).toBeVisible();
});

test("cancel activation while package is downloading never starts microphone later", async ({
  page,
}) => {
  await page.evaluate(() => {
    const s = (
      window as unknown as {
        voiceTest: { availability: string; deferred: boolean };
      }
    ).voiceTest;
    s.availability = "downloading";
    s.deferred = true;
  });
  await page
    .getByRole("button", { name: "Ativar escuta", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "sendo baixado",
  );
  await page.getByRole("button", { name: "Instalar português local" }).click();
  await page.getByRole("button", { name: "Cancelar ativação" }).click();
  await page.evaluate(() =>
    (
      window as unknown as { voiceTest: { finish: () => void } }
    ).voiceTest.finish(),
  );
  await page.waitForTimeout(700);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { voiceTest: { starts: number } }).voiceTest
          .starts,
    ),
  ).toBe(0);
});
