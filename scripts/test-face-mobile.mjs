import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { chromium, devices, expect, webkit } from "@playwright/test";

// Regression for an inert facial button and password-manager DOM autofill.
// Authentication is intercepted: this test never logs into a real account.
const reserve = createServer();
await new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve));
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const origin = `http://localhost:${port}`;
const server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "-p", String(port)], {
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", chunk => { logs += chunk; });
server.stderr.on("data", chunk => { logs += chunk; });
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(origin + "/login")).ok) { ready = true; break; } } catch {}
    if (server.exitCode !== null) throw new Error(`Next exited: ${logs.slice(-1000)}`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, "Production login must start");
  for (const [engine, device] of [[chromium, "Pixel 7"], [webkit, "iPhone 13"]]) {
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext(devices[device]);
      const page = await context.newPage();
      // Windows WebKit has no camera backend. Only feature detection is stubbed;
      // the intercepted authentication failure must prevent any camera call.
      if (engine === webkit) await page.addInitScript(() => {
        if (!navigator.mediaDevices?.getUserMedia)
          Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
            getUserMedia: async () => { throw new Error("Camera requested before successful authentication"); },
          } });
      });
      const starts = [];
      await page.route("**/api/login/face", async route => {
        starts.push(route.request().postDataJSON());
        await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Verificação de credenciais de teste." }) });
      });
      await page.goto(origin + "/login");
      const button = page.getByRole("button", { name: "Entrar com reconhecimento facial" });
      await expect(button).toBeEnabled();
      await button.tap();
      await expect(page.locator("#login-error")).toContainText("Informe e-mail ou matrícula e senha");
      await expect(page.getByLabel("E-mail ou matrícula")).toBeFocused();
      assert.equal(starts.length, 0);
      await page.getByLabel("E-mail ou matrícula").fill("mobile-test");
      await button.tap();
      await expect(page.getByLabel("Senha", { exact: true })).toBeFocused();
      assert.equal(starts.length, 0);
      await page.evaluate(() => {
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setValue.call(document.getElementById("identity"), "autofilled-mobile-test");
        setValue.call(document.getElementById("password"), "autofilled-test-password");
      });
      await button.tap();
      const capture = page.getByLabel("Captura facial");
      await expect(capture.getByRole("alert")).toHaveText("Verificação de credenciais de teste.");
      await expect(capture.getByLabel("Prévia da câmera")).toBeInViewport();
      assert.equal(starts.length, 1);
      assert.equal(starts[0].identity, "autofilled-mobile-test");
      assert.equal(starts[0].password, "autofilled-test-password");
      assert.equal(starts[0].purpose, "login");
      await capture.getByRole("button", { name: "Cancelar", exact: true }).tap();
      await expect(page.getByLabel("E-mail ou matrícula")).toBeFocused();
      await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("autofilled-test-password");
      console.log(`PASS: ${engine.name()} / ${device}: touch, missing-field feedback, DOM autofill, visible preview, server error and cancel (mock authentication).`);
    } finally { await browser.close(); }
  }
} finally {
  const closed = new Promise(resolve => server.once("close", resolve));
  server.kill();
  await closed;
}
