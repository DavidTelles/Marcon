import assert from "node:assert/strict";
import { expect } from "@playwright/test";

// The actual Next/React assistant receives controlled Web Speech events.
// This verifies application behavior, not physical microphone accuracy.
export async function testMarcoWake(browser, storageState, origin) {
  const context = await browser.newContext({ storageState });
  try {
    await context.addInitScript(() => {
      const state = { starts: 0, aborted: 0, current: null };
      class Recognition {
        start() {
          state.starts++;
          state.current = this;
          this.onstart?.();
        }
        abort() {
          state.aborted++;
        }
      }
      window.SpeechRecognition = Recognition;
      window.marcoWakeTest = state;
    });
    const page = await context.newPage();
    let chatCalls = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().endsWith("/api/james/chat")
      )
        chatCalls++;
    });
    await page.route("**/api/james/voice", (route) =>
      route.fulfill({ json: { transcribe: false, speak: false } }),
    );
    await page.goto(origin + "/admin/create");
    await page
      .getByRole("button", { name: "Abrir Marco", exact: true })
      .click();
    await expect(
      page.getByText(/Ao ativar a escuta, a transcrição/),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Ativar escuta", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Ouvindo pelo navegador" }),
    ).toBeVisible();
    assert.equal(await page.evaluate(() => window.marcoWakeTest.starts), 1);
    assert.equal(
      await page.evaluate(() => window.marcoWakeTest.current.lang),
      "pt-BR",
    );
    const emit = (text, isFinal = true) =>
      page.evaluate(
        ({ text, isFinal }) => {
          window.marcoWakeTest.current.onresult?.({
            resultIndex: 0,
            results: [{ isFinal, 0: { transcript: text } }],
          });
        },
        { text, isFinal },
      );

    // Interim transcripts are visible, but never execute or wake the assistant.
    await page
      .getByRole("button", { name: "Fechar Marco", exact: true })
      .click();
    await emit("Marcos", false);
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await emit("Marcos");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Chamado reconhecido" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Fechar Marco", exact: true })
      .click();
    await emit("Marco");
    await expect(page.getByRole("dialog")).toBeVisible();
    assert.equal(
      chatCalls,
      0,
      "Calling the name alone must not invoke the model or business actions",
    );

    // A repeated final event doesn't reopen the dialog or duplicate a command.
    await page
      .getByRole("button", { name: "Fechar Marco", exact: true })
      .click();
    await emit("Marco");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page
      .getByRole("button", { name: "Abrir Marco", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Pausar escuta", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Ativar escuta", exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => window.marcoWakeTest.starts))
      .toBe(2);
    await page
      .getByRole("button", { name: "Fechar Marco", exact: true })
      .click();
    await emit("Marco");
    await expect(page.getByRole("dialog")).toBeVisible();

    // Exercise the real authenticated action and router with the new alias.
    await emit("Marcos, abra estoque");
    await page.waitForURL(origin + "/admin/dashboard/stock");
    assert.equal(chatCalls, 1);
    await page
      .getByRole("button", { name: "Abrir Marco", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Pausar escuta", exact: true })
      .click();

    // A late availability response must not start capture after cancellation.
    await page.unroute("**/api/james/voice");
    let finish;
    const deferred = new Promise((resolve) => {
      finish = resolve;
    });
    await page.route("**/api/james/voice", async (route) => {
      await deferred;
      await route
        .fulfill({ json: { transcribe: false, speak: false } })
        .catch(() => {});
    });
    const starts = await page.evaluate(() => window.marcoWakeTest.starts);
    await page
      .getByRole("button", { name: "Ativar escuta", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cancelar ativação", exact: true })
      .click();
    finish();
    await expect(
      page.getByRole("button", { name: "Ativar escuta", exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(300);
    assert.equal(
      await page.evaluate(() => window.marcoWakeTest.starts),
      starts,
    );

    await page.unroute("**/api/james/voice");
    let expire;
    const slowHealth = new Promise((resolve) => {
      expire = resolve;
    });
    await page.route("**/api/james/voice", async (route) => {
      await slowHealth;
      await route
        .fulfill({ json: { transcribe: false, speak: false } })
        .catch(() => {});
    });
    await page
      .getByRole("button", { name: "Ativar escuta", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "demorou demais" }),
    ).toBeVisible({ timeout: 10000 });
    expire();
    assert.equal(
      await page.evaluate(() => window.marcoWakeTest.starts),
      starts,
    );
    await page
      .getByRole("button", {
        name: "Usar reconhecimento do navegador",
        exact: true,
      })
      .click();
    await expect
      .poll(() => page.evaluate(() => window.marcoWakeTest.starts))
      .toBe(starts + 1);
    await page.evaluate(() =>
      window.marcoWakeTest.current.onerror({ error: "not-allowed" }),
    );
    await expect(
      page.getByRole("alert").filter({ hasText: "Microfone sem permissão" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ativar escuta", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
}
