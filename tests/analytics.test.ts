import test from "node:test";
import assert from "node:assert/strict";
import { extractClientIp, shouldTrack } from "../src/lib/analytics/request-utils";

test("analytics only accepts public HTML page paths", () => {
  assert.equal(shouldTrack("/market", "GET", "text/html"), true);
  assert.equal(shouldTrack("/admin", "GET", "text/html"), false);
  assert.equal(shouldTrack("/api/foundation/quote", "GET", "application/json"), false);
  assert.equal(shouldTrack("/_next/static/app.js", "GET", "text/javascript"), false);
});
test("IP extraction prefers controlled proxy headers and normalizes mapped IPv4", () => {
  const h = new Headers({ "x-real-ip": "::ffff:203.0.113.9", "x-forwarded-for": "198.51.100.3" });
  assert.deepEqual(extractClientIp(h), { ip: "203.0.113.9", source: "x-real-ip" });
});
