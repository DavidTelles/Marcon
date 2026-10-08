import assert from "node:assert/strict";
import sharp from "sharp";

// Real CPU inference + real Next routes + isolated Neon schema. Perspective
// fixtures are synthetic, not proof of identity/liveness on a physical camera.
export async function checkNodeFacialWorkflow({ page, browser, origin, password, sql, model, consent }) {
  const health = await page.request.get(origin + "/api/login/face?health=1");
  assert.equal(health.status(), 200, await health.text());
  assert.deepEqual(await health.json(), { status: "ok", model, dimensions: 128 });
  const post = (request, data) => request.post(origin + "/api/login/face", { headers: { origin }, data });
  const start = (request, purpose, extra = {}) => post(request, { action: "start", purpose, password, consent, ...extra });
  const samples = {};
  for (const pose of ["center", "left", "right"]) {
    samples[pose] = await Promise.all(Array.from({ length: 5 }, async (_, i) =>
      (await sharp(`tests/fixtures/ai-face-${pose}.jpg`).linear(1, i * 4).jpeg({ quality: 85 }).toBuffer()).toString("base64"),
    ));
  }
  const finish = async (request, challenge) => {
    assert.equal(challenge.status(), 200, await challenge.text());
    const { poses, model: returnedModel } = await challenge.json();
    assert.equal(returnedModel, model);
    assert.ok(poses.includes("left") && poses.includes("right"));
    return post(request, { action: "finish", model, images: poses.map((pose, i) => samples[pose][i]) });
  };
  assert.equal((await start(page.request, "register", { password: "incorrect" })).status(), 401);
  for (const [identity, destination] of [
    ["test-admin", "/admin/dashboard"], ["test-worker", "/employee/request"],
    ["test-leader", "/department-head/dashboard"], ["test-keeper", "/warehouse/dashboard"],
  ]) {
    const enrollment = await finish(page.request, await start(page.request, "register", identity === "test-admin" ? {} : { adminTarget: identity }));
    assert.equal(enrollment.status(), 200, identity + ": " + await enrollment.text());
    const stored = (await sql("SELECT f.embeddings,f.model_version,f.consent_version FROM face_credentials f JOIN users u ON u.id=f.user_id WHERE u.employee_no=$1", [identity])).rows[0];
    assert.ok(Buffer.isBuffer(stored.embeddings));
    assert.equal(stored.model_version, model);
    assert.equal(stored.consent_version, consent);
    assert.equal((await post(page.request, { action: "finish", model, images: samples.center })).status(), 400, "Registration challenge cannot be replayed");
    const context = await browser.newContext();
    try {
      assert.equal((await start(context.request, "login", { identity, password: "incorrect" })).status(), 401);
      const login = await finish(context.request, await start(context.request, "login", { identity }));
      assert.equal(login.status(), 200, identity + ": " + await login.text());
      assert.equal((await login.json()).destination, destination);
      const names = (await context.cookies()).map((cookie) => cookie.name);
      assert.ok(names.includes("marcon_session") && names.includes("marcon_api_token"));
      assert.equal((await context.request.get(origin + "/api/workspace")).status(), 200);
      assert.equal((await post(context.request, { action: "finish", model, images: samples.center })).status(), 400);
      assert.equal((await post(context.request, { action: "delete", password })).status(), 200);
      assert.equal((await (await context.request.get(origin + "/api/login/face")).json()).enrolled, false);
    } finally {
      await context.close();
    }
  }
}
