import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NextResponse } from "next/server";
import { authorizeAuthenticatedAdmin } from "../src/lib/admin/admin-request";
import { AdminAuthService, readAdminAuthEnvironment } from "../src/lib/admin/auth";
import { toPublicAdminLoginResponse } from "../src/lib/admin/auth-public";
import { AdminDatabase } from "../src/lib/admin/database";
import { clearAdminSessionCookie, setAdminSessionCookie } from "../src/lib/admin/request";
import { hashAdminPassword, hashSessionToken } from "../src/lib/admin/security";

const NOW = 1_750_000_000_000;
const EMAIL = "owner@example.test";
const PASSWORD = "correct horse battery staple";
const IP_SECRET = "acceptance-ip-secret-at-least-32-characters";

function fixture() {
  let now = NOW;
  const directory = mkdtempSync(join(tmpdir(), "gtt-auth-acceptance-"));
  const passwordHash = hashAdminPassword(PASSWORD);
  const database = new AdminDatabase({
    path: join(directory, "auth.sqlite"),
    bootstrapEmail: EMAIL,
    bootstrapPasswordHash: passwordHash,
    now: () => now,
  });
  const auth = new AdminAuthService(database, {
    ipHmacSecret: IP_SECRET,
    absoluteTtlMs: 20_000,
    idleTtlMs: 10_000,
    rotationIntervalMs: 5_000,
    attemptWindowMs: 10_000,
    maxFailedAttempts: 2,
    lockoutMs: 10_000,
  }, () => now);
  return {
    auth,
    database,
    passwordHash,
    setNow(value: number) { now = value; },
    login(email = EMAIL, password = PASSWORD, ipAddress = "192.0.2.50") {
      return auth.login({ email, password, ipAddress, userAgent: "AcceptanceBrowser/1.0" });
    },
    cleanup() {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("unknown email and invalid password have identical public behavior", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  const unknown = context.login("missing@example.test", "wrong", "192.0.2.51");
  const invalid = context.login(EMAIL, "wrong", "192.0.2.52");
  assert.deepEqual(unknown, { ok: false, reason: "INVALID_CREDENTIALS" });
  assert.deepEqual(invalid, { ok: false, reason: "INVALID_CREDENTIALS" });
  assert.deepEqual(toPublicAdminLoginResponse(unknown), toPublicAdminLoginResponse(invalid));
  assert.deepEqual(toPublicAdminLoginResponse(unknown), {
    status: 401,
    body: { error: "Invalid credentials." },
  });
});

test("missing sessions and insufficient roles are rejected by protected authorization", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  assert.deepEqual(authorizeAuthenticatedAdmin(context.auth, null, "audit.read"), {
    ok: false, status: 401, error: "Session expired.",
  });
  context.database.db.prepare(`
    INSERT INTO admin_users (id, email, password_hash, role, is_active, created_at, updated_at)
    VALUES ('00000000-0000-4000-8000-000000000099', 'editor@example.test', ?, 'EDITOR', 1, ?, ?)
  `).run(context.passwordHash, NOW, NOW);
  const editor = context.login("editor@example.test", PASSWORD, "192.0.2.53");
  assert.equal(editor.ok, true);
  if (!editor.ok) return;
  assert.deepEqual(authorizeAuthenticatedAdmin(context.auth, editor.token, "admin.users.manage"), {
    ok: false, status: 403, error: "Access denied.",
  });
  assert.equal(authorizeAuthenticatedAdmin(context.auth, editor.token, "news.write").ok, true);
});

test("logout invalidates the session and records a successful audit", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  const login = context.login();
  assert.equal(login.ok, true);
  if (!login.ok) return;
  const tokenHash = hashSessionToken(login.token);
  context.auth.logout(login.token, "192.0.2.50");
  assert.equal(context.auth.authenticate(login.token), null);
  const remaining = context.database.db.prepare(
    "SELECT COUNT(*) AS count FROM admin_sessions WHERE token_hash = ?",
  ).get(tokenHash) as { count: number };
  assert.equal(Number(remaining.count), 0);
  const audit = context.database.db.prepare(`
    SELECT action, result, actor_role, target_id FROM admin_audit_logs
    WHERE action = 'ADMIN_LOGOUT'
  `).get() as { action: string; result: string; actor_role: string; target_id: string };
  assert.deepEqual({ ...audit }, {
    action: "ADMIN_LOGOUT", result: "SUCCESS", actor_role: "OWNER", target_id: tokenHash,
  });
});

test("deactivated admins cannot log in or continue an existing session", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  const login = context.login();
  assert.equal(login.ok, true);
  if (!login.ok) return;
  context.database.db.prepare(
    "UPDATE admin_users SET is_active = 0, updated_at = ? WHERE email = ?",
  ).run(NOW, EMAIL);
  assert.equal(context.auth.authenticate(login.token), null);
  assert.deepEqual(context.login(EMAIL, PASSWORD, "192.0.2.54"), {
    ok: false, reason: "INVALID_CREDENTIALS",
  });
});

test("pair rate limiting is persisted and public output is bounded", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  assert.equal(context.login(EMAIL, "wrong", "192.0.2.55").ok, false);
  assert.equal(context.login(EMAIL, "wrong", "192.0.2.55").ok, false);
  const limited = context.login(EMAIL, PASSWORD, "192.0.2.55");
  assert.deepEqual(limited, { ok: false, reason: "RATE_LIMITED" });
  assert.deepEqual(toPublicAdminLoginResponse(limited), {
    status: 429,
    body: { error: "Too many attempts. Try again later." },
    headers: { "Retry-After": "900" },
  });
});

test("login responses never serialize tokens, hashes, CSRF, or credentials", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  const login = context.login();
  assert.equal(login.ok, true);
  if (!login.ok) return;
  const serialized = JSON.stringify(toPublicAdminLoginResponse(login));
  for (const secret of [login.token, login.session.tokenHash, login.session.csrfToken, PASSWORD, context.passwordHash]) {
    assert.ok(!serialized.includes(secret));
  }
  assert.equal(serialized, '{"status":200,"body":{"ok":true}}');
});

test("failed and successful login audits contain outcomes without passwords", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  context.login(EMAIL, "do-not-log-this-password", "192.0.2.56");
  context.login(EMAIL, PASSWORD, "192.0.2.57");
  const audits = context.database.db.prepare(`
    SELECT action, result, metadata_json, actor_role FROM admin_audit_logs
    WHERE action LIKE 'ADMIN_LOGIN_%' ORDER BY id
  `).all() as Array<{ action: string; result: string; metadata_json: string | null; actor_role: string | null }>;
  assert.deepEqual(audits.map(({ action, result }) => ({ action, result })), [
    { action: "ADMIN_LOGIN_FAILED", result: "FAILURE" },
    { action: "ADMIN_LOGIN_SUCCEEDED", result: "SUCCESS" },
  ]);
  assert.equal(audits[0].actor_role, "OWNER");
  assert.deepEqual(JSON.parse(audits[0].metadata_json ?? "{}"), { reason: "INVALID_CREDENTIALS" });
  const serialized = JSON.stringify(audits);
  assert.ok(!serialized.includes("do-not-log-this-password"));
  assert.ok(!serialized.includes(PASSWORD));
  assert.ok(!serialized.includes(context.passwordHash));
});

test("auth environment requires separate session and IP secrets fail-closed", () => {
  const first = readAdminAuthEnvironment({
    ADMIN_IP_HMAC_SECRET: "first-ip-hmac-secret-at-least-32-characters",
    ADMIN_SESSION_SECRET: "first-session-secret-at-least-32-characters",
  });
  const second = readAdminAuthEnvironment({
    ADMIN_IP_HMAC_SECRET: "first-ip-hmac-secret-at-least-32-characters",
    ADMIN_SESSION_SECRET: "different-session-secret-at-least-32-chars",
  });
  assert.deepEqual(first, { ipHmacSecret: "first-ip-hmac-secret-at-least-32-characters" });
  assert.deepEqual(second, first);
  assert.throws(() => readAdminAuthEnvironment({
    ADMIN_IP_HMAC_SECRET: "first-ip-hmac-secret-at-least-32-characters",
    ADMIN_SESSION_SECRET: "",
  }), /ADMIN_SESSION_SECRET/);
  assert.throws(() => readAdminAuthEnvironment({
    ADMIN_IP_HMAC_SECRET: "",
    ADMIN_SESSION_SECRET: "first-session-secret-at-least-32-characters",
  }), /ADMIN_IP_HMAC_SECRET/);
});

test("admin cookies are scoped, HTTP-only, strict, secure in production, and expiring", () => {
  const environment = process.env as Record<string, string | undefined>;
  const previous = environment.NODE_ENV;
  environment.NODE_ENV = "production";
  try {
    const response = NextResponse.json({ ok: true });
    setAdminSessionCookie(response, "session-token", NOW + 20_000);
    const cookie = response.headers.get("set-cookie") ?? "";
    assert.match(cookie, /^gtt_admin_session=session-token/);
    assert.match(cookie, /Path=\/admin/i);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /SameSite=strict/i);
    assert.match(cookie, /Expires=/i);

    const cleared = NextResponse.json({ ok: true });
    clearAdminSessionCookie(cleared);
    const clearCookie = cleared.headers.get("set-cookie") ?? "";
    assert.match(clearCookie, /^gtt_admin_session=/);
    assert.match(clearCookie, /Path=\/admin/i);
    assert.match(clearCookie, /HttpOnly/i);
    assert.match(clearCookie, /Secure/i);
    assert.match(clearCookie, /SameSite=strict/i);
    assert.match(clearCookie, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
  } finally {
    environment.NODE_ENV = previous;
  }
});

