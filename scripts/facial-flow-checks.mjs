import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { devices, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function installCamera(page, options = {}) {
  await page.addInitScript(({ portrait, denyFirst, blockAutoplay }) => {
    window.faceTest = { calls: 0, tracks: [], playAttempts: 0 };
    if (blockAutoplay) {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (this.srcObject && window.faceTest.playAttempts++ === 0)
          return Promise.reject(new DOMException("Autoplay blocked", "NotAllowedError"));
        return play.call(this);
      };
    }
    navigator.mediaDevices.getUserMedia = async () => {
      window.faceTest.calls++;
      if (denyFirst && window.faceTest.calls === 1)
        throw new DOMException("Permission denied", "NotAllowedError");
      const canvas = document.createElement("canvas");
      canvas.width = portrait ? 480 : 640; canvas.height = portrait ? 640 : 480;
      const c = canvas.getContext("2d"); let frame = 0;
      const draw = () => {
        frame++; c.fillStyle = `rgb(${frame % 255},100,150)`;
        c.fillRect(0, 0, canvas.width, canvas.height); c.fillStyle = "white";
        c.font = "64px sans-serif"; c.fillText(`Camera fixture ${frame}`, 20, 240);
      };
      draw(); const timer = setInterval(draw, 100), stream = canvas.captureStream(10);
      for (const track of stream.getTracks()) {
        window.faceTest.tracks.push(track);
        const stop = track.stop.bind(track);
        track.stop = () => { clearInterval(timer); stop(); };
      }
      window.faceTest.openedAt = performance.now();
      return stream;
    };
  }, options);
}

// Controlled extraction provider for persistence/session tests. The Python
// engine has separate tests using real models and a synthetic face fixture.
export async function startFacialFixtureService() {
  const token = randomBytes(32).toString("hex");
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "Unauthorized test service" }));
      return;
    }
    if (req.url === "/health" && req.method === "GET") {
      res.end(JSON.stringify({ status: "ok", model: "opencv-yunet-sface-2023mar-v1", dimensions: 128 }));
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const label = input.images?.[0] ? Buffer.from(input.images[0], "base64").toString() : "";
    const index = label.startsWith("different") ? 1 : label.startsWith("worker") ? 2 :
      label.startsWith("leader") ? 3 : label.startsWith("keeper") ? 4 : 0;
    const vector = Array.from({ length: 128 }, (_, i) =>
      i === index ? 1 : 0,
    );
    res.end(
      JSON.stringify({
        model: input.model,
        embeddings: Array.from({ length: input.images.length }, () => vector),
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    token,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export async function checkFacialWorkflow({
  page,
  browser,
  origin,
  password,
  sql,
  model,
  consent,
  encryptFace,
}) {
  const pending = new WeakMap();
  const frames = (label, count = 5) =>
    Array.from({ length: count }, (_, i) =>
      Buffer.from(`${label}-${i}-`.repeat(300)).toString("base64"),
    );
  const post = (request, data) =>
    request.post(origin + "/api/login/face", { headers: { origin }, data });
  const start = async (request, purpose, extra = {}) => {
    const response = await post(request, {
      action: "start",
      purpose,
      ...(purpose === "register" ? { identity: "test-admin", password, consent } : {}),
      ...extra,
    });
    if (response.ok()) pending.set(request, await response.json());
    return response;
  };
  const finish = (request, label = "same") =>
    post(request, { action: "finish", model, images: frames(label, pending.get(request)?.poses.length ?? 5) });
  assert.equal(
    (await page.request.get(origin + "/api/login/face")).status(),
    200,
  );
  assert.equal((await start(page.request, "register", { password: undefined })).status(), 401);
  assert.equal((await page.request.post(origin + "/api/login/face", {
    headers: { origin: "https://unrelated.example" },
    data: { action: "start", purpose: "register", password, consent },
  })).status(), 403);
  assert.equal((await page.request.post(origin + "/api/login/face", {
    headers: { host: "marcon-alias.local", origin: "http://marcon-alias.local" },
    data: { action: "start", purpose: "register", consent },
  })).status(), 401, "Legitimate host alias must reach the password check instead of origin rejection");
  await installCamera(page);
  await page.goto(origin + "/profile");
  const card = page.locator('section[aria-labelledby="face-register-heading"]');
  await expect(card.getByText("Consultando cadastro…")).toHaveCount(0);
  const passwordInput = card.getByLabel("Senha atual para cadastrar ou excluir");
  const registerButton = card.getByRole("button", { name: "Cadastrar rosto", exact: true });
  await expect(registerButton).toBeDisabled();
  await passwordInput.fill("incorrect");
  await card.getByRole("checkbox").check();
  let starts = 0;
  const recordStarts = request => {
    if (request.url().endsWith("/api/login/face") && request.method() === "POST" && request.postDataJSON()?.action === "start") starts++;
  };
  page.on("request", recordStarts);
  await registerButton.click();
  await expect(card.getByRole("alert")).toContainText("Senha atual incorreta");
  await expect(card.getByLabel("Captura facial")).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.faceTest.calls), 0, "Wrong password must not request the camera");
  assert.equal(Number((await sql("SELECT COUNT(*) AS count FROM face_credentials")).rows[0].count), 0);
  await passwordInput.fill(password);
  await registerButton.click();
  await expect.poll(() => page.evaluate(() => window.faceTest.calls)).toBe(1);
  assert.equal(starts, 2, "Password preflight must not issue a second challenge when opening capture");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });
  await expect(card.getByRole("alert")).toContainText("Captura interrompida");
  assert.ok(await page.evaluate(() => window.faceTest.tracks.every(t => t.readyState === "ended")));
  await card.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("Rosto cadastrado", { timeout: 45000 });
  await expect(passwordInput).toHaveValue("");
  assert.equal(starts, 3, "Retry must get a new password-verified challenge");
  assert.ok(await page.evaluate(() => window.faceTest.tracks.every(t => t.readyState === "ended")));
  page.off("request", recordStarts);
  await mkdir(".validation/facial", { recursive: true });
  for (const width of [320, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `.validation/facial/profile-${width}.png`, fullPage: true });
  }
  // Independent scenarios below retain the production limiter; reset only its
  // fixture rows so lifecycle coverage does not consume the next scenario's quota.
  await sql("DELETE FROM auth_attempts");
  for (const invalidPassword of [undefined, "incorrect"]) {
    assert.equal((await start(page.request, "register", { adminTarget: "test-worker", password: invalidPassword })).status(), 401, "Admin enrollment must require the acting administrator's password");
  }
  const stored = (
    await sql(
      "SELECT f.embeddings,f.consent_version FROM face_credentials f JOIN users u ON u.id=f.user_id WHERE u.employee_no='test-admin'",
    )
  ).rows;
  assert.equal(stored.length, 1);
  assert.equal(stored[0].consent_version, consent);
  assert.ok(Buffer.isBuffer(stored[0].embeddings));
  assert.equal(
    (await finish(page.request)).status(),
    400,
    "challenge must be single-use",
  );

  const context = await browser.newContext();
  try {
    assert.equal((await start(context.request, "login")).status(), 200);
    const anonymous = (await sql("SELECT user_id,password_hash FROM face_challenges WHERE purpose='login'")).rows;
    assert.ok(anonymous.length > 0 && anonymous.every(row => row.user_id === null && row.password_hash === null));
    assert.equal((await post(context.request, { action: "finish", recognized: true, userId: "test-admin" })).status(), 422, "Client recognition flags cannot authorize login");
    assert.equal(
      (await finish(context.request, "different")).status(),
      401,
      "a different face must not issue sessions",
    );
    assert.equal((await finish(context.request)).status(), 400, "Failed matching also consumes the challenge");
    assert.equal(
      (await context.request.get(origin + "/api/workspace")).status(),
      401,
    );
    assert.equal((await start(context.request, "login", { identity: "test-worker", password: "incorrect" })).status(), 200);
    const concurrent = await Promise.all([finish(context.request), finish(context.request)]);
    assert.deepEqual(concurrent.map(response => response.status()).sort(), [200, 400], "Only one concurrent finish may issue sessions");
    const login = concurrent.find(response => response.ok());
    assert.equal(login.status(), 200, await login.text());
    assert.equal((await login.json()).destination, "/admin/dashboard");
    const names = (await context.cookies()).map((cookie) => cookie.name);
    assert.ok(
      names.includes("marcon_session") && names.includes("marcon_api_token"),
    );
    assert.equal(
      (await context.request.get(origin + "/api/workspace")).status(),
      200,
    );
    assert.equal((await finish(context.request)).status(), 400);
    assert.equal((await post(context.request, { action: "delete", password: "incorrect" })).status(), 401);
    assert.equal((await (await context.request.get(origin + "/api/login/face")).json()).enrolled, true, "Wrong password must preserve enrollment");
    assert.equal(
      (await post(context.request, { action: "delete", password })).status(),
      200,
    );
    assert.equal(
      (await (await context.request.get(origin + "/api/login/face")).json())
        .enrolled,
      false,
    );
    assert.equal((await start(context.request, "login")).status(), 200);
    assert.equal(
      (await finish(context.request)).status(), 401,
      "deleted enrollments cannot authorize login",
    );
    assert.equal((await start(page.request, "register")).status(), 200);
    assert.equal((await finish(page.request)).status(), 200);
    const visitor = await browser.newContext();
    const workerId = Number((await sql("SELECT id FROM users WHERE employee_no='test-worker'")).rows[0].id);
    try {
      const reference = Array.from({ length: 5 }, () => Array.from({ length: 128 }, (_, i) => i === 0 ? 1 : 0));
      await sql("INSERT INTO face_credentials(user_id,embeddings,model_version,consent_version) VALUES($1,$2,$3,$4)", [workerId, encryptFace(workerId, reference), model, consent]);
      assert.equal((await start(visitor.request, "login")).status(), 200);
      assert.equal((await finish(visitor.request)).status(), 409, "Two matching accounts must be rejected");
      assert.equal((await visitor.request.get(origin + "/api/workspace")).status(), 401);
      await sql("DELETE FROM face_credentials WHERE user_id=$1", [workerId]);
      await sql("UPDATE users SET active=FALSE WHERE employee_no='test-admin'");
      assert.equal((await start(visitor.request, "login")).status(), 200);
      assert.equal((await finish(visitor.request)).status(), 401, "Inactive accounts cannot be identified");
      assert.equal((await visitor.request.get(origin + "/api/workspace")).status(), 401);
    } finally {
      await sql("UPDATE users SET active=TRUE WHERE employee_no='test-admin'");
      await sql("DELETE FROM face_credentials WHERE user_id=$1", [workerId]);
      await visitor.close();
    }
    for (const [device, cameraOptions] of [
      ["Pixel 7", { denyFirst: true }],
      ["iPhone 13", { portrait: true, blockAutoplay: true }],
    ]) {
      await sql("DELETE FROM auth_attempts");
      const cameraContext = await browser.newContext({ ...devices[device], permissions: ["camera"] });
      try {
        const cameraPage = await cameraContext.newPage();
        // Simulate the camera with real video tracks, independent of OS prompts.
        await installCamera(cameraPage, cameraOptions);
        await cameraPage.bringToFront();
        let captureMs;
        const loginRequests = [];
        await cameraPage.exposeFunction("recordFaceCapture", ms => { captureMs = ms; });
        await cameraPage.addInitScript(() => {
          const originalFetch = window.fetch;
          window.fetch = function (input, init) {
            if (input === "/api/login/face" && init?.body && JSON.parse(init.body).action === "finish")
              void window.recordFaceCapture(performance.now() - window.faceTest.openedAt);
            return originalFetch.call(this, input, init);
          };
        });
        cameraPage.on("request", request => {
          if (!request.url().endsWith("/api/login/face") || request.method() !== "POST") return;
          const body = request.postDataJSON();
          loginRequests.push(body);
        });
        await cameraPage.goto(origin + "/login");
        const facialButton = cameraPage.getByRole("button", { name: "Entrar com reconhecimento facial" });
        await expect(facialButton).toBeEnabled();
        await expect(cameraPage.getByLabel("E-mail ou matrícula")).toHaveValue("");
        await expect(cameraPage.getByLabel("Senha", { exact: true })).toHaveValue("");
        await facialButton.tap();
        await cameraPage
          .getByLabel("Prévia da câmera")
          .waitFor({ state: "visible" });
        await expect(cameraPage.getByLabel("Prévia da câmera")).toBeInViewport();
        if (cameraOptions.denyFirst) {
          await expect(cameraPage.getByLabel("Captura facial").getByRole("alert")).toContainText("Permita o acesso à câmera");
          assert.equal(loginRequests.filter(body => body.action === "finish").length, 0);
          await cameraPage.getByRole("button", { name: "Tentar novamente", exact: true }).tap();
        }
        if (cameraOptions.blockAutoplay) {
          const enablePreview = cameraPage.getByRole("button", { name: "Ativar prévia da câmera", exact: true });
          await expect(enablePreview).toBeVisible();
          assert.equal(loginRequests.filter(body => body.action === "finish").length, 0);
          await cameraPage.getByRole("button", { name: "Cancelar", exact: true }).tap();
          await expect(cameraPage.getByLabel("E-mail ou matrícula")).toBeFocused();
          await expect(cameraPage.getByLabel("Senha", { exact: true })).toHaveValue("");
          assert.ok(await cameraPage.evaluate(() => window.faceTest.tracks.every(track => track.readyState === "ended")));
          await cameraPage.evaluate(() => { window.faceTest.playAttempts = 0; });
          await facialButton.tap();
          await expect(enablePreview).toBeVisible();
          await cameraPage.screenshot({ path: `.validation/facial/login-${device.replaceAll(" ", "-")}.png`, fullPage: true });
          await enablePreview.tap();
        }
        try {
          await cameraPage.waitForURL("**/admin/dashboard", { timeout: 45000 });
        } catch (error) {
          const alerts = await cameraPage.getByRole("alert").allTextContents();
          const status = await cameraPage.getByRole("status").allTextContents();
          throw new Error(
            `Facial browser capture failed: ${JSON.stringify({ alerts, status })}`,
            { cause: error },
          );
        }
        const sessionNames = (await cameraContext.cookies()).map(
          (cookie) => cookie.name,
        );
        assert.ok(
          sessionNames.includes("marcon_session") &&
            sessionNames.includes("marcon_api_token"),
        );
        const automaticCapture = loginRequests.find(body => body.action === "finish");
        assert.ok(loginRequests.every(body => !Object.hasOwn(body, "identity") && !Object.hasOwn(body, "password")), "Facial browser login must never send credentials");
        assert.equal(loginRequests.filter(body => body.action === "start").length, 2, "Retry/cancel gets a new challenge; activating the preview reuses the verified challenge");
        assert.equal(automaticCapture.images.length, 3, "Login sends only three automatic frontal frames");
        assert.ok(captureMs >= 1200 && captureMs < (cameraOptions.blockAutoplay ? 10000 : 5000), `Camera capture took ${captureMs}ms; processing/network excluded`);
        console.log(`PASS: ${device} credential-free facial login with ${cameraOptions.denyFirst ? "permission retry" : "autoplay recovery and portrait video"}; capture ${Math.round(captureMs)}ms (emulated device and camera)`);
        assert.equal(
          (await cameraContext.request.get(origin + "/api/workspace")).status(),
          200,
        );
      } finally {
        await cameraContext.close();
      }
    }
  } finally {
    await context.close();
  }
  for (const [identity, label, destination] of [
    ["test-worker", "worker", "/employee/request"],
    ["test-leader", "leader", "/department-head/dashboard"],
    ["test-keeper", "keeper", "/warehouse/dashboard"],
  ]) {
    const actor = await browser.newContext();
    const visitor = await browser.newContext();
    try {
      assert.equal((await actor.request.post(origin + "/api/login", { headers: { origin }, data: { identity, password } })).status(), 200);
      assert.equal((await start(actor.request, "register", { identity })).status(), 200);
      const registered = await finish(actor.request, label);
      assert.equal(registered.status(), 200, await registered.text());
      assert.equal((await start(visitor.request, "login")).status(), 200);
      const loggedIn = await finish(visitor.request, label);
      assert.equal(loggedIn.status(), 200, await loggedIn.text());
      assert.equal((await loggedIn.json()).destination, destination);
      assert.equal((await visitor.request.get(origin + "/api/workspace")).status(), 200);
      const names = (await visitor.cookies()).map(cookie => cookie.name);
      assert.ok(names.includes("marcon_session") && names.includes("marcon_api_token"));
    } finally { await actor.close(); await visitor.close(); }
  }
}
