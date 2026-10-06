import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

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
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const different =
      input.images?.[0] &&
      Buffer.from(input.images[0], "base64").toString().startsWith("different");
    const vector = Array.from({ length: 128 }, (_, i) =>
      i === (different ? 1 : 0) ? 1 : 0,
    );
    res.end(
      JSON.stringify({
        model: input.model,
        embeddings: Array.from({ length: 5 }, () => vector),
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
}) {
  const frames = (label) =>
    Array.from({ length: 5 }, (_, i) =>
      Buffer.from(`${label}-${i}-`.repeat(300)).toString("base64"),
    );
  const post = (request, data) =>
    request.post(origin + "/api/login/face", { headers: { origin }, data });
  const start = (request, purpose, extra = {}) =>
    post(request, {
      action: "start",
      purpose,
      identity: "test-admin",
      password,
      consent,
      ...extra,
    });
  const finish = (request, label = "same") =>
    post(request, { action: "finish", model, images: frames(label) });
  assert.equal(
    (await page.request.get(origin + "/api/login/face")).status(),
    200,
  );
  assert.equal(
    (await start(page.request, "register", { password: "incorrect" })).status(),
    401,
  );
  assert.equal((await start(page.request, "register")).status(), 200);
  const registration = await finish(page.request);
  assert.equal(registration.status(), 200, await registration.text());
  assert.equal((await registration.json()).ok, true);
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
    assert.equal(
      (
        await start(context.request, "login", { password: "incorrect" })
      ).status(),
      401,
    );
    assert.equal((await start(context.request, "login")).status(), 200);
    assert.equal(
      (await finish(context.request, "different")).status(),
      401,
      "a different face must not issue sessions",
    );
    assert.equal(
      (await context.request.get(origin + "/api/workspace")).status(),
      401,
    );
    assert.equal((await start(context.request, "login")).status(), 200);
    const login = await finish(context.request);
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
    assert.equal(
      (await post(context.request, { action: "delete", password })).status(),
      200,
    );
    assert.equal(
      (await (await context.request.get(origin + "/api/login/face")).json())
        .enrolled,
      false,
    );
    assert.equal(
      (await start(context.request, "login")).status(),
      401,
      "deleted enrollments cannot authorize login",
    );
    assert.equal((await start(page.request, "register")).status(), 200);
    assert.equal((await finish(page.request)).status(), 200);
    const cameraContext = await browser.newContext({ permissions: ["camera"] });
    try {
      const cameraPage = await cameraContext.newPage();
      // Simulate the camera with real video tracks, independent of OS prompts.
      await cameraPage.addInitScript(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 480;
          const context = canvas.getContext("2d");
          let frame = 0;
          const draw = () => {
            frame++;
            context.fillStyle = `rgb(${frame % 255},100,150)`;
            context.fillRect(0, 0, 640, 480);
            context.fillStyle = "white";
            context.font = "64px sans-serif";
            context.fillText(`Camera fixture ${frame}`, 20, 240);
          };
          draw();
          const timer = setInterval(draw, 100);
          const stream = canvas.captureStream(10);
          for (const track of stream.getTracks()) {
            const stop = track.stop.bind(track);
            track.stop = () => {
              clearInterval(timer);
              stop();
            };
          }
          return stream;
        };
      });
      await cameraPage.bringToFront();
      await cameraPage.goto(origin + "/login");
      await cameraPage.getByLabel("E-mail ou matrícula").fill("test-admin");
      await cameraPage.getByLabel("Senha", { exact: true }).fill(password);
      await cameraPage
        .getByRole("button", { name: "Entrar com reconhecimento facial" })
        .click();
      await cameraPage
        .getByLabel("Prévia da câmera")
        .waitFor({ state: "visible" });
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
      assert.equal(
        (await cameraContext.request.get(origin + "/api/workspace")).status(),
        200,
      );
    } finally {
      await cameraContext.close();
    }
  } finally {
    await context.close();
  }
}
