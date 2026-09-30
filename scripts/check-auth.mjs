import assert from "node:assert/strict";
const base = process.env.TEST_URL || "http://localhost:3000";
const request = (path, options = {}) => fetch(base + path, { redirect: "manual", ...options });
const login = (identity, password) => request("/api/login", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: base },
  body: JSON.stringify({ identity, password }),
});
assert.equal((await request("/login")).status, 200);
assert.equal((await request("/inicio/admin")).headers.get("location"), "/login");
for (const password of ["", "incorreta"]) assert.equal((await login("1001", password)).status, 401);
for (const [identity, role] of [["ana@marcon.demo", "funcionario"], ["1002", "lider"], ["1003", "almoxarifado"], ["1004", "admin"]]) {
  const response = await login(identity, "Marcon@123");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).destination, "/inicio/" + role);
  const setCookie = response.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/i);
  const cookie = setCookie.split(";")[0];
  const home = await request("/inicio/" + role, { headers: { Cookie: cookie } });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Acesso confirmado/);
  assert.equal((await request("/login", { headers: { Cookie: cookie } })).headers.get("location"), "/inicio/" + role);
  const wrongRole = role === "admin" ? "funcionario" : "admin";
  assert.equal((await request("/inicio/" + wrongRole, { headers: { Cookie: cookie } })).headers.get("location"), "/inicio/" + role);
  const logout = await request("/api/logout", { method: "POST", headers: { Cookie: cookie, Origin: base } });
  assert.equal(logout.status, 303);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/i);
}
assert.equal((await request("/inicio/admin", { headers: { Cookie: "marcon_session=1004:9999999999999:forged" } })).headers.get("location"), "/login");
assert.equal((await request("/api/login", { method: "POST", headers: { Origin: "https://invalid.example", "Content-Type": "application/json" }, body: "{}" })).status, 403);
const rfid = await request("/api/login/rfid", {
  method: "POST",
  headers: { Origin: base, "Content-Type": "application/json" },
  body: JSON.stringify({ identity: "1004", role: "admin" }),
});
assert.equal(rfid.status, 200);
assert.equal((await rfid.json()).destination, "/inicio/funcionario");
assert.match(rfid.headers.get("set-cookie"), /HttpOnly/i);
assert.equal((await request("/api/login/rfid", { method: "POST", headers: { Origin: "https://invalid.example" } })).status, 403);
console.log("PASS: credential passwords, demo-only passwordless RFID, fixed RFID profile, protected routes, sessions, logout and origin validation.");
