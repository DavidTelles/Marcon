import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("voz local exige sessão, transcreve WAV no backend e gera fala sem provedor externo", async ({ request }) => {
  test.skip(!process.env.JAMES_TEST_WAVE, "Defina os binários, modelos e JAMES_TEST_WAVE.");
  test.setTimeout(60_000);
  const headers = { origin: "http://localhost:3101" };
  expect((await request.get("/api/james/voice")).status()).toBe(401);
  await request.post("/api/login", { headers, data: { identity: "1001", password: process.env.SEED_PASSWORD } });
  const status = await request.get("/api/james/voice");
  expect(await status.json()).toEqual({ transcribe: true, speak: true });
  const wave = await readFile(process.env.JAMES_TEST_WAVE!);
  const start = performance.now();
  const transcript = await request.post("/api/james/voice", { headers: { ...headers, "Content-Type": "audio/wav" }, data: wave });
  expect(transcript.status(), await transcript.text()).toBe(200);
  const asr = await transcript.json();
  expect(asr.transcript.toLowerCase()).toContain("parafuso");
  expect(transcript.headers()["server-timing"]).toContain("asr");
  const response = await request.post("/api/james/voice", { headers, data: { text: "Você precisa do M6 ou do M8?" } });
  expect(response.status(), await response.text()).toBe(200);
  expect((await response.body()).toString("ascii", 0, 4)).toBe("RIFF");
  console.log(JSON.stringify({ asrApiMs: Math.round(performance.now() - start), asrEngineMs: asr.processingMs, ttsServerTiming: response.headers()["server-timing"] }));
  await request.post("/api/logout", { headers });
  expect((await request.get("/api/james/voice")).status()).toBe(401);
});

test("permissão de microfone negada mantém texto disponível", async ({ page }) => {
  test.skip(!process.env.JAMES_TEST_WAVE, "O backend de voz local deve estar configurado.");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new DOMException("Denied", "NotAllowedError")) },
    });
  });
  await page.request.post("/api/login", { headers: { origin: "http://localhost:3101" }, data: { identity: "1001", password: process.env.SEED_PASSWORD } });
  await page.goto("/employee/request");
  await page.getByRole("button", { name: "Abrir James" }).click();
  await page.getByRole("button", { name: "Ativar escuta" }).click();
  await expect(page.getByRole("status")).toContainText("Sem permissão");
  await expect(page.getByLabel("Sua pergunta ou correção")).toBeEnabled();
});

test("resposta em texto inicia áudio, permite interromper e volta a falar após navegar", async ({ page }) => {
  test.skip(!process.env.JAMES_TEST_WAVE, "O backend de voz local deve estar configurado.");
  let failFirstSpeech = true;
  await page.route("**/api/james/voice", async (route) => {
    const request = route.request();
    if (failFirstSpeech && request.method() === "POST" && request.headers()["content-type"]?.startsWith("application/json")) {
      failFirstSpeech = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Voz em teste indisponível." }) });
    } else await route.continue();
  });
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      sessionStorage.setItem("james-play-count", String(Number(sessionStorage.getItem("james-play-count") || 0) + 1));
      return original.apply(this, args);
    };
  });
  await page.request.post("/api/login", {
    headers: { origin: "http://localhost:3101" },
    data: { identity: "1001", password: process.env.SEED_PASSWORD },
  });
  const ask = async (expectAudio = true) => {
    await page.getByRole("button", { name: "Abrir James" }).click();
    await page.getByLabel("Sua pergunta ou correção").fill("Oi");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByRole("log")).toContainText("Como está seu dia?");
    if (expectAudio)
      await expect.poll(() => page.evaluate(() => Number(sessionStorage.getItem("james-play-count") || 0))).toBeGreaterThan(0);
  };
  await page.goto("/employee/request");
  await ask(false);
  await expect(page.getByRole("status")).not.toContainText("Falando");
  await expect(page.getByRole("button", { name: "Tentar falar novamente" })).toBeVisible();
  await page.getByRole("button", { name: "Tentar falar novamente" }).click();
  await expect.poll(() => page.evaluate(() => Number(sessionStorage.getItem("james-play-count") || 0))).toBeGreaterThan(0);
  await expect(page.getByRole("status")).toContainText("Falando");
  await page.getByRole("button", { name: "Interromper fala" }).click();
  const beforeNavigation = await page.evaluate(() => Number(sessionStorage.getItem("james-play-count") || 0));
  await page.goto("/employee/history");
  await ask();
  await expect.poll(() => page.evaluate(() => Number(sessionStorage.getItem("james-play-count") || 0))).toBeGreaterThan(beforeNavigation);
});
