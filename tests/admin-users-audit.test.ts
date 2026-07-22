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
import { appendAdminAuditLog } from "../src/lib/admin/audit";
import { AuditLogService } from "../src/lib/admin/audit-log";
import type { AdminIdentity } from "../src/lib/admin/auth";
import { AdminDatabase } from "../src/lib/admin/database";
import { AdminPermissionError } from "../src/lib/admin/permissions";
import { hashAdminPassword } from "../src/lib/admin/security";
import { AdminUserError, AdminUserService } from "../src/lib/admin/users";

const NOW = 1_900_000_000_000;
const OWNER: AdminIdentity = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "owner@example.test",
  role: "OWNER",
  displayName: "Owner",
};
const ADMIN: AdminIdentity = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "admin@example.test",
  role: "ADMIN",
  displayName: null,
};

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "gtt-admin-users-"));
  const database = new AdminDatabase({ path: join(directory, "admin.sqlite"), now: () => NOW });
  const hash = hashAdminPassword("fixture password");
  database.db.prepare(`
    INSERT INTO admin_users (id, email, password_hash, role, display_name, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(OWNER.id, OWNER.email, hash, OWNER.role, OWNER.displayName, NOW, NOW);
  database.db.prepare(`
    INSERT INTO admin_users (id, email, password_hash, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).run(ADMIN.id, ADMIN.email, hash, ADMIN.role, NOW, NOW);
  return {
    database,
    users: new AdminUserService(database, () => NOW),
    audit: new AuditLogService(database, () => NOW + 1),
    hash,
    cleanup() { database.close(); rmSync(directory, { recursive: true, force: true }); },
  };
}

test("only owners can list or create users and creation requires encoded scrypt", (t) => {
  const context = fixture(); t.after(() => context.cleanup());
  assert.throws(() => context.users.list(ADMIN), AdminPermissionError);
  assert.throws(() => context.users.create({
    email: "viewer@example.test", role: "VIEWER", passwordHash: "plaintext",
  }, OWNER), (error: unknown) => error instanceof AdminUserError && error.code === "INVALID");
  const created = context.users.create({
    email: "  VIEWER@example.test ", displayName: "Viewer", role: "VIEWER", passwordHash: context.hash,
  }, OWNER);
  assert.equal(created.email, "viewer@example.test");
  assert.equal(created.role, "VIEWER");
  const stored = context.database.db.prepare("SELECT password_hash FROM admin_users WHERE id = ?").get(created.id) as { password_hash: string };
  assert.equal(stored.password_hash, context.hash);
});

test("the final active owner cannot be demoted or deactivated", (t) => {
  const context = fixture(); t.after(() => context.cleanup());
  assert.throws(
    () => context.users.update(OWNER.id, { role: "ADMIN" }, OWNER),
    (error: unknown) => error instanceof AdminUserError && error.code === "LAST_OWNER",
  );
  assert.throws(
    () => context.users.update(OWNER.id, { isActive: false }, OWNER),
    (error: unknown) => error instanceof AdminUserError && error.code === "LAST_OWNER",
  );
  const second = context.users.create({
    email: "owner2@example.test", role: "OWNER", passwordHash: context.hash,
  }, OWNER);
  assert.equal(context.users.update(second.id, { isActive: false }, OWNER).isActive, false);
});

test("session revocation is persisted and audited", (t) => {
  const context = fixture(); t.after(() => context.cleanup());
  context.database.db.prepare(`
    INSERT INTO admin_sessions (
      token_hash, user_id, csrf_secret, created_at, last_seen_at, idle_expires_at,
      absolute_expires_at, rotated_at
    ) VALUES ('token-hash', ?, 'csrf', ?, ?, ?, ?, ?)
  `).run(ADMIN.id, NOW, NOW, NOW + 10_000, NOW + 10_000, NOW);
  assert.equal(context.users.revokeSessions(ADMIN.id, OWNER), 1);
  const session = context.database.db.prepare("SELECT revoked_at FROM admin_sessions WHERE token_hash = 'token-hash'").get() as { revoked_at: number };
  assert.equal(session.revoked_at, NOW);
  const audit = context.database.db.prepare("SELECT action FROM admin_audit_logs ORDER BY id DESC LIMIT 1").get() as { action: string };
  assert.equal(audit.action, "ADMIN_USER_SESSIONS_REVOKED");
});

test("role changes record actor, result, and safe metadata", (t) => {
  const context = fixture(); t.after(() => context.cleanup());
  context.users.update(ADMIN.id, { role: "EDITOR" }, OWNER);
  const row = context.database.db.prepare(`
    SELECT actor_role, result, metadata_json FROM admin_audit_logs
    WHERE action = 'ADMIN_USER_CHANGED'
  `).get() as { actor_role: string; result: string; metadata_json: string };
  assert.equal(row.actor_role, "OWNER");
  assert.equal(row.result, "SUCCESS");
  assert.deepEqual(JSON.parse(row.metadata_json).role, { from: "ADMIN", to: "EDITOR" });
});

test("audit filters sanitize metadata and owner export is itself audited", (t) => {
  const context = fixture(); t.after(() => context.cleanup());
  appendAdminAuditLog(context.database, {
    actorUserId: OWNER.id, actorEmail: OWNER.email, actorRole: OWNER.role,
    action: "SETTINGS_CHANGED", targetType: "setting", targetId: "mail",
    result: "SUCCESS", metadata: { password: "never-log-this", nested: { token: "secret", safe: "visible" } },
    createdAt: NOW,
  });
  appendAdminAuditLog(context.database, {
    actorUserId: ADMIN.id, actorEmail: ADMIN.email, actorRole: ADMIN.role,
    action: "NEWS_CHANGED", targetType: "news_post", result: "FAILURE", createdAt: NOW - 100,
  });
  const result = context.audit.list({
    actor: "owner@", action: "SETTINGS_CHANGED", entity: "setting",
    result: "SUCCESS", from: NOW, to: NOW,
  }, ADMIN);
  assert.equal(result.total, 1);
  assert.deepEqual(result.items[0].metadata, {
    password: "[redacted]", nested: { token: "[redacted]", safe: "visible" },
  });
  assert.throws(() => context.audit.exportCsv({}, ADMIN), AdminPermissionError);
  const csv = context.audit.exportCsv({ action: "SETTINGS_CHANGED" }, OWNER);
  assert.match(csv, /SETTINGS_CHANGED/);
  assert.ok(!csv.includes("never-log-this"));
  const exported = context.database.db.prepare(
    "SELECT COUNT(*) AS count FROM admin_audit_logs WHERE action = 'AUDIT_LOG_EXPORTED'",
  ).get() as { count: number };
  assert.equal(Number(exported.count), 1);
  assert.throws(
    () => context.database.db.prepare("DELETE FROM admin_audit_logs").run(),
    /append-only/,
  );
});
