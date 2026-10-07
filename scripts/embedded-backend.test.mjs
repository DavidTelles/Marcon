import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "hosting-test-secret-32-characters-minimum";
const require = createRequire(import.meta.url);
const repository = require("../backend/src/repositories/userRepository.js");
const { hashPassword } = require("../backend/src/utils/password.js");
const { verifyToken, signToken } = require("../backend/src/utils/token.js");
const { embeddedRequest } = require("../backend/embedded.js");
const password = "HostingTestPassword@123";
const user = {
  id: 42,
  employee_no: "test-hosting",
  name: "Test",
  email: "hosting@example.com",
  role: "admin",
  active: 1,
  password_hash: await hashPassword(password),
};
repository.findByEmail = async () => user;
repository.findByEmployeeCode = async () => user;
repository.findById = async () => user;
repository.getPermissionsForUser = async () => [];
repository.getPermissionOverridesForUser = async () => ({});

test("embedded backend runs without a listening Express server", async () => {
  assert.deepEqual(await embeddedRequest("/health"), {
    status: 200,
    body: { service: "marcon-backend", transport: "embedded" },
  });
});
test("login retains backend validation, password verification and JWT issuance", async () => {
  assert.equal(
    (await embeddedRequest("/login", { method: "POST", body: {} })).status,
    400,
  );
  assert.equal(
    (
      await embeddedRequest("/login", {
        method: "POST",
        body: { login: "test-hosting", password: "incorrect" },
      })
    ).status,
    401,
  );
  const login = await embeddedRequest("/login", {
    method: "POST",
    body: { login: "test-hosting", password },
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.ok, true);
  assert.equal(login.body.data.user.employee_code, "test-hosting");
  assert.equal(verifyToken(login.body.data.token).sub, 42);
});
test("every protected endpoint rejects missing, invalid and expired tokens", async () => {
  const expired = require("jsonwebtoken").sign(
    { sub: 42 },
    process.env.JWT_SECRET,
    { expiresIn: -1 },
  );
  for (const [method, path] of [
    ["GET", "/api/workspace/snapshot"],
    ["GET", "/api/workspace/transfers"],
    ["POST", "/api/workspace/actions"],
    ["POST", "/api/products/resolve-code"],
    ["GET", "/api/parts/consumption"],
    ["GET", "/api/industrial-links"],
    ["POST", "/api/industrial-links"],
    ["GET", "/api/products/1794"],
    ["GET", "/api/pcp/armazens"],
    ["POST", "/api/pcp/recebimentos"],
    ["PATCH", "/api/pcp/recebimentos/1/conferencia"],
    ["POST", "/estoque/transferencias"],
  ]) {
    for (const token of [undefined, "invalid", expired])
      assert.equal(
        (await embeddedRequest(path, { method, token, body: {} })).status,
        401,
        `${method} ${path}`,
      );
  }
});
test("authenticated actions retain domain validation and disabled-user checks", async () => {
  const token = signToken({ sub: 42 });
  assert.equal(
    (
      await embeddedRequest("/api/workspace/actions", {
        method: "POST",
        token,
        body: { type: "unknown" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await embeddedRequest("/api/products/resolve-code", {
        method: "POST",
        token,
        body: { code: "" },
      })
    ).status,
    400,
  );
  user.active = 0;
  assert.equal(
    (
      await embeddedRequest("/api/workspace/actions", {
        method: "POST",
        token,
        body: {},
      })
    ).status,
    401,
  );
  user.active = 1;
});
test("face login validates grants and unknown routes fail explicitly", async () => {
  assert.equal(
    (
      await embeddedRequest("/login/face", {
        method: "POST",
        body: { grant: "invalid" },
      })
    ).status,
    400,
  );
  assert.equal((await embeddedRequest("/unknown")).status, 404);
  assert.equal(
    (await embeddedRequest("https://example.com/login")).status,
    400,
  );
  assert.equal((await embeddedRequest("//example.com/login")).status, 400);
});
test("embedded transport preserves the Express JSON size limit", async () => {
  assert.equal(
    (
      await embeddedRequest("/login", {
        method: "POST",
        body: { login: "test", password: "x".repeat(2 * 1024 * 1024) },
      })
    ).status,
    413,
  );
});

test("embedded transport accepts the base64 expansion of a 1 MB photo", async () => {
  const image = `data:image/jpeg;base64,${Buffer.alloc(999000).toString("base64")}`;
  assert.ok(Buffer.byteLength(JSON.stringify({ image })) > 1024 * 1024);
  const result = await embeddedRequest("/api/workspace/actions", {
    method: "POST",
    body: { image },
  });
  assert.equal(
    result.status,
    401,
    "The request reaches authentication instead of failing at the old 1 MB boundary",
  );
});
