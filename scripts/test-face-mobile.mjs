import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { chromium, devices, expect, webkit } from "@playwright/test";

// Credential-free facial button regression in mobile Chromium and WebKit.
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
      // the intercepted challenge failure must prevent any camera call.
      if (engine === webkit) await page.addInitScript(() => {
        if (!navigator.mediaDevices?.getUserMedia)
          Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
            getUserMedia: async () => { throw new Error("Camera requested after failed challenge"); },
          } });
      });
      const starts = [];
      await page.route("**/api/login/face", async route => {
        starts.push(route.request().postDataJSON());
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Falha facial simulada." }) });
      });
      await page.goto(origin + "/login");
      const button = page.getByRole("button", { name: "Entrar com reconhecimento facial" });
      await expect(button).toBeEnabled();
      await expect(page.getByLabel("E-mail ou matrícula")).toHaveValue("");
      await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("");
      await button.tap();
      const capture = page.getByLabel("Captura facial");
      await expect(capture.getByRole("alert")).toHaveText("Falha facial simulada.");
      await expect(capture.getByLabel("Prévia da câmera")).toBeInViewport();
      assert.equal(starts.length, 1);
      assert.equal(starts[0].purpose, "login");
      assert.ok(!Object.hasOwn(starts[0], "identity") && !Object.hasOwn(starts[0], "password"));
      await capture.getByRole("button", { name: "Cancelar", exact: true }).tap();
      await expect(page.getByLabel("E-mail ou matrícula")).toBeFocused();
      await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("");
      // Even when regular-login fields are filled, facial requests omit them.
      await page.getByLabel("E-mail ou matrícula").fill("mobile-test");
      await page.getByLabel("Senha", { exact: true }).fill("test-password");
      await button.tap();
      await expect(capture.getByRole("alert")).toHaveText("Falha facial simulada.");
      assert.equal(starts.length, 2);
      assert.ok(starts.every(body => !Object.hasOwn(body, "identity") && !Object.hasOwn(body, "password")));
      await capture.getByRole("button", { name: "Cancelar", exact: true }).tap();
      await expect(page.getByLabel("E-mail ou matrícula")).toBeFocused();
      await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("test-password");
      console.log(`PASS: ${engine.name()} / ${device}: credential-free touch, no credentials sent, visible preview, server error and cancel (mock challenge).`);
    } finally { await browser.close(); }
  }
} finally {
  const closed = new Promise(resolve => server.once("close", resolve));
  server.kill();
  await closed;
}
