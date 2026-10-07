import { test } from "node:test";
import assert from "node:assert/strict";
import { sameOrigin } from "../lib/request-origin.ts";

const request = (origin, host, protocol = "http") => new Request("http://localhost:3000/api/items/resolve", { headers: { ...(origin ? { origin } : {}), host, "x-forwarded-proto": protocol } });
test("permite a autoridade real de localhost e de aliases, mesmo com URL interna normalizada", () => {
  assert.equal(sameOrigin(request("http://localhost:3000", "localhost:3000")), true);
  assert.equal(sameOrigin(request("http://127.0.0.1:3000", "127.0.0.1:3000")), true);
  assert.equal(sameOrigin(request("http://[::1]:3000", "[::1]:3000")), true);
  assert.equal(sameOrigin(request("https://marcon-ten.vercel.app", "marcon-ten.vercel.app", "https")), true);
});
test("bloqueia origem externa, protocolo/porta diferentes, origem ausente e valores que não são Origin", () => {
  for (const input of [request("https://evil.test", "marcon-ten.vercel.app", "https"), request("http://marcon-ten.vercel.app", "marcon-ten.vercel.app", "https"), request("http://localhost:3001", "localhost:3000"), request(null, "localhost:3000"), request("null", "localhost:3000"), request("http://localhost:3000/path", "localhost:3000"), request("http://user:pass@localhost:3000", "localhost:3000"), request("http://localhost:3000", "localhost:3000/path"), request("http://localhost:3000", "localhost:3000", "javascript")]) assert.equal(sameOrigin(input), false);
});
