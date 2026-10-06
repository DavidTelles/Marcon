import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const compiled = await build({
  stdin: {
    contents: `
      import { StrictMode, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { DashboardDialog } from './components/workspace/operations/dashboard-dialog';
      function Fixture() {
        const [open, setOpen] = useState(false);
        const [nested, setNested] = useState(false);
        return <main>
          <h1>Fundo da requisição</h1>
          <button style={{marginTop:800}} onClick={() => setOpen(true)}>Ver requisição</button>
          <DashboardDialog open={open} title="Requisição de teste" onClose={() => setOpen(false)}>
            <button onClick={() => setNested(true)}>Abrir confirmação</button>
            {Array.from({length:50}, (_, i) => <p key={i}>Detalhe da requisição {i}</p>)}
          </DashboardDialog>
          <DashboardDialog open={nested} title="Confirmação" onClose={() => setNested(false)}>
            <p>Confirmar a operação</p>
          </DashboardDialog>
        </main>;
      }
      createRoot(document.getElementById('root')).render(<StrictMode><Fixture /></StrictMode>);
    `,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
});
const css = await readFile("app/globals.css", "utf8");
const server = createServer((request, response) => {
  if (request.url === "/fixture.js") {
    response.setHeader("Content-Type", "text/javascript");
    response.end(compiled.outputFiles[0].text);
  } else {
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}\nbody{min-height:3500px;margin:0}main{padding:16px}.dashboard-dialog{background:white;color:black}</style><div id="root"></div><script src="/fixture.js"></script>`);
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
  for (const width of [1280, 375]) {
    const context = await browser.newContext({ viewport: { width, height: 812 }, hasTouch: width === 375 });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const trigger = page.getByRole("button", { name: "Ver requisição", exact: true });
    await trigger.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    assert.ok(before > 0, "Fixture must start with a scrolled background");
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Requisição de teste", exact: true });
    await dialog.waitFor();
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).position), "fixed");
    const top = await trigger.evaluate((element) => element.getBoundingClientRect().top);
    await page.mouse.move(1, 1);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(150);
    assert.equal(await trigger.evaluate((element) => element.getBoundingClientRect().top), top);
    const box = await dialog.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 400);
    await page.waitForFunction(() => document.querySelector("dialog[open]").scrollTop > 0);
    assert.equal(await trigger.evaluate((element) => element.getBoundingClientRect().top), top);
    await dialog.getByRole("button", { name: "Abrir confirmação" }).click();
    await page.getByRole("dialog", { name: "Confirmação", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Confirmação", exact: true }).waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).position), "fixed");
    await dialog.getByRole("button", { name: "Fechar Requisição de teste", exact: true }).click();
    await page.waitForFunction(() => getComputedStyle(document.body).position !== "fixed");
    assert.equal(await page.evaluate(() => window.scrollY), before);
    await trigger.click();
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => getComputedStyle(document.body).position !== "fixed");
    assert.equal(await page.evaluate(() => window.scrollY), before);
    console.info(`PASS: ${width}px background stays fixed, dialog scrolls, nested dialogs preserve the lock, close and Escape restore the original position`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
