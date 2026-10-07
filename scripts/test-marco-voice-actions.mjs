import assert from "node:assert/strict";
import { expect } from "@playwright/test";

// Only recognition events are controlled. Authentication, Groq interpretation,
// confirmation, requests API and PostgreSQL writes all use the actual application.
export async function testMarcoVoiceActions(
  browser,
  storageState,
  origin,
  records,
) {
  const context = await browser.newContext({ storageState });
  try {
    await context.addInitScript(() => {
      const state = { current: null };
      class Recognition {
        start() {
          state.current = this;
          this.onstart?.();
        }
        abort() {}
      }
      window.SpeechRecognition = Recognition;
      window.marcoVoiceActions = state;
      window.speechSynthesis.speak = (utterance) =>
        setTimeout(() => utterance.onend?.(), 0);
      window.speechSynthesis.cancel = () => {};
    });
    const page = await context.newPage();
    await page.route("**/api/james/voice", (route) =>
      route.fulfill({ json: { transcribe: false, speak: false } }),
    );
    await page.goto(origin + "/employee/request");
    await page
      .getByRole("button", { name: "Abrir Marco", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Ativar escuta", exact: true })
      .click();
    const command = async (text) => {
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              Boolean(window.marcoVoiceActions.current?.onresult),
            ),
          { timeout: 10000 },
        )
        .toBe(true);
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/james/chat") &&
          r.request().method() === "POST",
        { timeout: 60000 },
      );
      await page.evaluate(
        (text) =>
          window.marcoVoiceActions.current.onresult({
            resultIndex: 0,
            results: [{ isFinal: true, 0: { transcript: text } }],
          }),
        text,
      );
      const result = await response;
      assert.equal(
        result.status(),
        200,
        result.status() === 200 ? undefined : await result.text(),
      );
      // Wait for the assistant to process and speak the real response before continuing.
      await expect(
        page.getByRole("button", { name: "Enviar", exact: true }),
      ).toBeEnabled({ timeout: 60000 });
      return result;
    };
    const before = await records();
    await command(
      "Marco, você pode colocar três unidades de TEST-PART no meu carrinho?",
    );
    await expect(page.getByText(/Deseja colocar 3/)).toBeVisible();
    assert.equal((await records()).length, before.length);
    await command("sim");
    await expect(
      page.getByText("Item confirmado no carrinho.", { exact: true }),
    ).toBeVisible();
    await command("Marco, pode enviar a minha requisição agora?");
    await expect(
      page.getByText(/Para enviar, diga ou clique Confirmar requisição/),
    ).toBeVisible();
    assert.equal((await records()).length, before.length);
    await command("confirmar requisição");
    await expect
      .poll(async () => (await records()).length, { timeout: 15000 })
      .toBe(before.length + 1);
    const added = (await records()).at(-1);
    assert.equal(added.code, "TEST-PART");
    assert.equal(Number(added.quantity), 3);
    assert.equal(added.status, "Pendente");
    // A repeated recognition event may not create another business request.
    await page.evaluate(() =>
      window.marcoVoiceActions.current?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "confirmar requisição" } }],
      }),
    );
    await page.waitForTimeout(500);
    assert.equal((await records()).length, before.length + 1);
  } finally {
    await context.close();
  }
}
