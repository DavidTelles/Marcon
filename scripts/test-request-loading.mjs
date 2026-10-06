import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

// Exercise the actual form; control only the store response and Next navigation.
const mocks = {
  "../demo-store": `import {useState} from 'react'; export function useDemoStore(){
    const [cart,setCart]=useState(window.initialCart || []);
    return {stock:[{id:1,code:'ROL-6205-ZZ',name:'Rolamento 6205 ZZ',quantity:10,available:10,packSize:1,category:'Rolamentos',warehouse:'Central',unit:'un'}],requests:[],setRequests:()=>{},cart,setCart,persistent:true,
    runAction:(action)=>{window.calls=(window.calls||0)+1;window.lastAction=action;return new Promise((resolve,reject)=>{window.finish=()=>resolve({ids:[123]});window.fail=()=>reject(new Error('Falha de teste. Tente novamente.'));});}};}`,
  "../employee-identity": `export const useEmployeeName=()=> 'Funcionário';export const useEmployeeBlock=()=> 'Bloco A';`,
  "next/navigation": `export const useRouter=()=>({push:(path)=>{window.destination=path;}});`,
  "next/link": `export default function Link({children,...props}){return <a {...props}>{children}</a>;}`,
  "next/image": `export default function Image({fill,unoptimized,priority,...props}){return <img {...props}/>;}`,
};
const compiled = await build({
  stdin: {
    contents: `import {createRoot} from 'react-dom/client';import {EmployeeRequestScreen} from './components/workspace/screens/employee-request-screen';createRoot(document.getElementById('root')).render(<EmployeeRequestScreen routePart={window.initialCart ? undefined : '1'}/>);`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, write: false, outfile: "fixture.js", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "controlled-store", setup(builder) {
    builder.onResolve({ filter: /demo-store$|employee-identity$|^next\/(navigation|link|image)$/ }, (args) =>
      mocks[args.path] ? { path: args.path, namespace: "fixture" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({ contents: mocks[args.path], loader: "tsx", resolveDir: process.cwd() }));
  } }],
});
const js = compiled.outputFiles.find((file) => file.path.endsWith(".js")).text;
const css = compiled.outputFiles.find((file) => file.path.endsWith(".css")).text;
const globalCss = await readFile("app/globals.css", "utf8");
const server = createServer((request, response) => {
  response.setHeader("Content-Type", request.url === "/fixture.js" ? "text/javascript" : "text/html");
  response.end(request.url === "/fixture.js" ? js : `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>${globalCss}\n${css}</style><div id="root"></div><script src="/fixture.js"></script>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
  await mkdir(".validation/request-loading", { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByText("Detalhes da peça", { exact: true }).click();
  await page.getByText("ID ROL-6205-ZZ · QR ROL-6205-ZZ", { exact: true }).waitFor();
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.getByText("Detalhes da peça", { exact: true }).click();
  assert.equal(await page.getByRole("heading", { name: "Carrinho · 0 itens", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Requisitar este item", exact: true }).click();
  await page.getByLabel("Quantidade", { exact: true }).fill("2");
  await page.getByLabel("Confirme a quantidade", { exact: true }).fill("2");
  await page.getByLabel(/Justificativa/).fill("Reposição para manutenção");
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.getByRole("button", { name: "Confirmar requisição", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Enviando requisição…", exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel("Quantidade", { exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Cancelar", exact: true }).isDisabled(), true);
  await page.getByRole("status").filter({ hasText: "Registrando seu pedido" }).waitFor();
  await page.locator("form").evaluate((form) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  assert.equal(await page.evaluate(() => window.calls), 1);
  await page.screenshot({ path: ".validation/request-loading/sending-desktop.png", fullPage: true });
  await page.evaluate(() => window.fail());
  await page.getByRole("alert").filter({ hasText: "Falha de teste" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Confirmar requisição", exact: true }).isEnabled(), true);
  assert.equal(await page.getByLabel("Quantidade", { exact: true }).inputValue(), "2");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Confirmar requisição", exact: true }).click();
  await page.getByRole("button", { name: "Enviando requisição…", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: ".validation/request-loading/sending-mobile.png", fullPage: true });
  await page.evaluate(() => window.finish());
  await page.getByRole("status").filter({ hasText: "Requisição #123 registrada" }).waitFor();
  const cartPage = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await cartPage.addInitScript(() => { window.initialCart = [{code:"ROL-6205-ZZ",quantity:2,requestedAmount:2,priority:"Leve",justification:"Manutenção"}]; });
  await cartPage.goto(`http://127.0.0.1:${server.address().port}`);
  await cartPage.getByRole("button", { name: "Finalizar requisição", exact: true }).click();
  assert.equal(await cartPage.getByRole("button", { name: "Enviando pedido…", exact: true }).isDisabled(), true);
  assert.equal(await cartPage.getByRole("button", { name: "Remover", exact: true }).isDisabled(), true);
  await cartPage.evaluate(() => window.finish());
  await cartPage.waitForFunction(() => window.destination === "/employee/requests");
  console.info("PASS: Actual request form and cart show loading, prevent duplicate submits, preserve input after errors, confirm success and fit mobile screens (controlled store response)");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
