/* eslint-disable @typescript-eslint/no-explicit-any */
import { Module } from "node:module";

const originalRequire = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string, ...args: any[]) {
  if (id === "server-only") return {};
  return originalRequire.apply(this, [id, ...args] as any);
};

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  hashAdminPassword,
  hashSessionToken,
  verifyAdminPassword,
} from "../src/lib/admin/security";
import { hasAdminPermission } from "../src/lib/admin/permissions";
import { AdminAuthService } from "../src/lib/admin/auth";
import { AdminDatabase } from "../src/lib/admin/database";

const IP_SECRET = "test-only-ip-hmac-secret-32-characters";
const EMAIL = "owner@example.test";
const PASSWORD = "correct horse battery staple";

function fixture() {
  let now = 1_700_000_000_000;
  const directory = mkdtempSync(join(tmpdir(), "gtt-admin-auth-"));
  const database = new AdminDatabase({
    path: join(directory, "admin.sqlite"),
    bootstrapEmail: EMAIL,
    bootstrapPasswordHash: hashAdminPassword(PASSWORD),
    now: () => now,
  });
  const auth = new AdminAuthService(
    database,
    {
      ipHmacSecret: IP_SECRET,
      absoluteTtlMs: 10_000,
      idleTtlMs: 1_000,
      rotationIntervalMs: 100,
      attemptWindowMs: 5_000,
      maxFailedAttempts: 2,
      lockoutMs: 2_000,
    },
    () => now,
  );

  return {
    database,
    auth,
    setNow(value: number) {
      now = value;
    },
    cleanup() {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("scrypt password hashes are versioned and reject incorrect passwords", () => {
  const hash = hashAdminPassword(PASSWORD);
  assert.match(hash, /^scrypt\$v=1\$N=131072\$r=8\$p=1\$/);
  assert.equal(verifyAdminPassword(PASSWORD, hash), true);
  assert.equal(verifyAdminPassword("incorrect", hash), false);
});

test("login normalizes email and stores only the session token hash", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());

  const result = context.auth.login({
    email: "  OWNER@EXAMPLE.TEST ",
    password: PASSWORD,
    ipAddress: "192.0.2.10",
    userAgent: "test-agent",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const row = context.database.db.prepare(
    "SELECT token_hash FROM admin_sessions",
  ).get() as { token_hash: string };
  assert.notEqual(row.token_hash, result.token);
  assert.equal(row.token_hash, hashSessionToken(result.token));
  assert.equal(context.auth.verifyCsrf(result.token, result.session.csrfToken), true);
});

test("sessions enforce idle expiry and rotate token plus CSRF state", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());

  const login = context.auth.login({
    email: EMAIL,
    password: PASSWORD,
    ipAddress: "192.0.2.11",
  });
  assert.equal(login.ok, true);
  if (!login.ok) return;
  const originalCsrf = login.session.csrfToken;

  context.setNow(1_700_000_000_101);
  const rotated = context.auth.authenticate(login.token);
  assert.ok(rotated?.rotatedToken);
  assert.equal(context.auth.authenticate(login.token), null);
  assert.equal(context.auth.verifyCsrf(login.token, originalCsrf), false);
  assert.equal(
    context.auth.verifyCsrf(rotated!.rotatedToken!, rotated!.csrfToken),
    true,
  );

  context.setNow(1_700_000_001_102);
  assert.equal(context.auth.authenticate(rotated!.rotatedToken!), null);
});

test("failed logins lock the account and pair rate limit is persisted", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = context.auth.login({
      email: EMAIL,
      password: "wrong",
      ipAddress: "192.0.2.12",
    });
    assert.equal(result.ok, false);
  }

  const rateLimited = context.auth.login({
    email: EMAIL,
    password: PASSWORD,
    ipAddress: "192.0.2.12",
  });
  assert.deepEqual(rateLimited, { ok: false, reason: "RATE_LIMITED" });

  const locked = context.auth.login({
    email: EMAIL,
    password: PASSWORD,
    ipAddress: "192.0.2.13",
  });
  assert.deepEqual(locked, { ok: false, reason: "LOCKED" });
});

test("role permissions follow least privilege", () => {
  assert.equal(hasAdminPermission("OWNER", "admin.users.manage"), true);
  assert.equal(hasAdminPermission("ADMIN", "admin.users.manage"), false);
  assert.equal(hasAdminPermission("EDITOR", "news.write"), true);
  assert.equal(hasAdminPermission("VIEWER", "news.write"), false);
});
