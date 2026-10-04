import assert from "node:assert/strict";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.TEST_URL || "http://localhost:3000";
const backend = process.env.BACKEND_URL || "http://localhost:3001";
const password = process.env.TEST_PASSWORD || process.env.SEED_PASSWORD;
assert.ok(password, "Defina TEST_PASSWORD ou SEED_PASSWORD para as contas de teste.");
let checks = 0;
async function check(url, expected, options = {}) {
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(60_000), ...options });
  assert.ok([].concat(expected).includes(response.status), `${new URL(url).pathname}: esperado ${expected}, recebido ${response.status}`);
  checks++;
  return response;
}
const request = (path, expected, options) => check(base + path, expected, options);
const login = (identity, secret) => ({
  method: "POST", headers: { "Content-Type": "application/json", Origin: base },
  body: JSON.stringify({ identity, password: secret }),
});

assert.deepEqual(await (await request("/health", 200)).json(), { status: "ok", database: "connected" });
await check(backend + "/health", 200);
await request("/login", 200);
await request("/api/login", 403, { ...login("1004", password), headers: { "Content-Type": "application/json", Origin: "https://invalid.example" } });
await request("/api/login", 400, { ...login("1004", password), body: "{" });
await request("/api/login", 400, { ...login("1004", password), body: "{}" });
await request("/api/login", 401, login("1004", "incorrect-password"));

const apiRoutes = ["/api/workspace", "/api/items", "/api/operations", "/api/requisicoes"];
const backendRoutes = ["/me", "/api/users", "/api/blocks", "/api/sectors", "/api/warehouses", "/api/products", "/api/stock", "/api/stock/movements", "/api/requests", "/api/workspace/snapshot", "/api/workspace/transfers", "/admin/dashboard", "/warehouse/dashboard", "/department-head/dashboard"];
for (const path of apiRoutes) await request(path, 401);
for (const path of backendRoutes) await check(backend + path, 401);

for (const [identity, landing] of [["1001", "/employee/request"], ["1002", "/department-head/dashboard"], ["1003", "/warehouse/dashboard"], ["1004", "/admin/dashboard"]]) {
  const response = await request("/api/login", 200, login(identity, password));
  assert.equal((await response.json()).destination, landing);
  const setCookies = response.headers.getSetCookie();
  assert.equal(setCookies.length, 2);
  for (const cookie of setCookies) assert.match(cookie, /HttpOnly/i);
  const cookie = setCookies.map(value => value.split(";")[0]).join("; ");
  const headers = { Cookie: cookie };
  const token = setCookies.find(value => value.startsWith("marcon_api_token="))?.split(";")[0].slice("marcon_api_token=".length);
  assert.ok(token);
  await request(landing, 200, { headers });
  await request("/api/workspace", 200, { headers });
  await request("/api/items", 200, { headers });
  await check(backend + "/me", 200, { headers: { Authorization: `Bearer ${token}` } });
  const profilePages = {
    "1001": ["/employee/history"],
    "1002": ["/department-head/requests", "/department-head/history", "/department-head/materials"],
    "1003": ["/warehouse/requests", "/warehouse/history", "/warehouse/returns", "/warehouse/stock/all/all"],
  };
  for (const path of profilePages[identity] || []) await request(path, 200, { headers });
  if (identity === "1004") {
    for (const path of apiRoutes) await request(path, 200, { headers });
    for (const path of backendRoutes) await check(backend + path, 200, { headers: { Authorization: `Bearer ${token}` } });
    for (const path of ["/admin/map", "/admin/all-requests", "/admin/history", "/admin/create", "/admin/purchases", "/admin/recommendations", "/profile"]) await request(path, 200, { headers });
    const catalog = await request("/catalogo", [200, 307], { headers });
    if (catalog.status === 307) assert.equal(catalog.headers.get("location"), "/admin/dashboard");
    else assert.match(await catalog.text(), /NEXT_REDIRECT;replace;\/admin\/dashboard;307;/);
  }
  const logout = await request("/api/logout", 303, { method: "POST", headers: { ...headers, Origin: base } });
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/i);
  console.log(`PASS: login, cookies, rotas e logout do perfil ${identity}`);
}
console.log(`PASS: ${checks} verificações HTTP com banco e backend reais.`);
