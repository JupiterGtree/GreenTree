import "server-only";

import { randomUUID } from "node:crypto";
import { appendAdminAuditLog } from "./audit";
import type { AdminIdentity } from "./auth";
import { getAdminDatabase, type AdminDatabase, type AdminRole } from "./database";
import { requireAdminPermission } from "./permissions";
import { isValidAdminPasswordHash, normalizeAdminEmail } from "./security";

export const ADMIN_ROLES: readonly AdminRole[] = ["OWNER", "ADMIN", "EDITOR", "VIEWER"];

export interface AdminUserView {
  id: string;
  email: string;
  role: AdminRole;
  displayName: string | null;
  isActive: boolean;
  lastLoginAt: number | null;
  createdAt: number;
  updatedAt: number;
  activeSessions: number;
}

export class AdminUserError extends Error {
  constructor(message: string, readonly code: "INVALID" | "NOT_FOUND" | "CONFLICT" | "LAST_OWNER") {
    super(message);
    this.name = "AdminUserError";
  }
}

export class AdminUserService {
  constructor(
    private readonly database: AdminDatabase = getAdminDatabase(),
    private readonly now: () => number = Date.now,
  ) {}

  list(actor: AdminIdentity): AdminUserView[] {
    requireAdminPermission(actor.role, "admin.users.manage");
    return this.database.db.prepare(`
      SELECT u.id, u.email, u.role, u.display_name, u.is_active, u.last_login_at,
             u.created_at, u.updated_at,
             COUNT(CASE WHEN s.token_hash IS NOT NULL AND s.revoked_at IS NULL THEN 1 END) AS active_sessions
      FROM admin_users u
      LEFT JOIN admin_sessions s ON s.user_id = u.id
        AND s.idle_expires_at > ? AND s.absolute_expires_at > ?
      GROUP BY u.id
      ORDER BY u.created_at, u.email
    `).all(this.now(), this.now()).map(toView);
  }

  create(
    input: { email: string; displayName?: string | null; role: AdminRole; passwordHash: string },
    actor: AdminIdentity,
  ): AdminUserView {
    this.assertOwner(actor);
    const email = validateEmail(input.email);
    const role = validateRole(input.role);
    const displayName = validateDisplayName(input.displayName);
    assertHash(input.passwordHash);
    const id = randomUUID();
    const now = this.now();
    try {
      this.database.transaction(() => {
        this.database.db.prepare(`
          INSERT INTO admin_users
            (id, email, password_hash, role, display_name, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `).run(id, email, input.passwordHash, role, displayName, now, now);
        this.audit(actor, "ADMIN_USER_CREATED", id, { email, role, displayName }, now);
      });
    } catch (error) {
      if (String(error).includes("UNIQUE")) throw new AdminUserError("An admin user with this email already exists.", "CONFLICT");
      throw error;
    }
    return this.getRequired(id);
  }

  update(
    id: string,
    input: { role?: AdminRole; isActive?: boolean; displayName?: string | null; passwordHash?: string },
    actor: AdminIdentity,
  ): AdminUserView {
    this.assertOwner(actor);
    const now = this.now();
    return this.database.transaction(() => {
      const current = this.getRequired(id);
      const role = input.role === undefined ? current.role : validateRole(input.role);
      const isActive = input.isActive ?? current.isActive;
      const displayName = input.displayName === undefined ? current.displayName : validateDisplayName(input.displayName);
      if (input.passwordHash !== undefined) assertHash(input.passwordHash);
      if (current.role === "OWNER" && current.isActive && (role !== "OWNER" || !isActive)) {
        const count = this.database.db.prepare(
          "SELECT COUNT(*) AS count FROM admin_users WHERE role = 'OWNER' AND is_active = 1",
        ).get() as { count: number };
        if (Number(count.count) <= 1) {
          throw new AdminUserError("The final active owner cannot be deactivated or demoted.", "LAST_OWNER");
        }
      }
      this.database.db.prepare(`
        UPDATE admin_users SET role = ?, is_active = ?, display_name = ?,
          password_hash = COALESCE(?, password_hash), updated_at = ? WHERE id = ?
      `).run(role, isActive ? 1 : 0, displayName, input.passwordHash ?? null, now, id);
      const changes: Record<string, unknown> = {};
      if (role !== current.role) changes.role = { from: current.role, to: role };
      if (isActive !== current.isActive) changes.active = { from: current.isActive, to: isActive };
      if (displayName !== current.displayName) changes.displayName = { from: current.displayName, to: displayName };
      if (input.passwordHash !== undefined) {
        changes.passwordHashReplaced = true;
        this.revokeSessionRows(id, now);
      }
      this.audit(actor, "ADMIN_USER_CHANGED", id, changes, now);
      return this.getRequired(id);
    });
  }

  revokeSessions(id: string, actor: AdminIdentity): number {
    this.assertOwner(actor);
    const now = this.now();
    return this.database.transaction(() => {
      this.getRequired(id);
      const count = this.revokeSessionRows(id, now);
      this.audit(actor, "ADMIN_USER_SESSIONS_REVOKED", id, { count }, now);
      return count;
    });
  }

  private revokeSessionRows(id: string, now: number): number {
    return Number(this.database.db.prepare(
      "UPDATE admin_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
    ).run(now, id).changes);
  }

  private getRequired(id: string): AdminUserView {
    const row = this.database.db.prepare(`
      SELECT u.id, u.email, u.role, u.display_name, u.is_active, u.last_login_at,
             u.created_at, u.updated_at,
             COUNT(CASE WHEN s.token_hash IS NOT NULL AND s.revoked_at IS NULL THEN 1 END) AS active_sessions
      FROM admin_users u LEFT JOIN admin_sessions s ON s.user_id = u.id
        AND s.idle_expires_at > ? AND s.absolute_expires_at > ?
      WHERE u.id = ? GROUP BY u.id
    `).get(this.now(), this.now(), id);
    if (!row) throw new AdminUserError("Admin user not found.", "NOT_FOUND");
    return toView(row);
  }

  private assertOwner(actor: AdminIdentity): void {
    requireAdminPermission(actor.role, "admin.users.manage");
  }

  private audit(actor: AdminIdentity, action: string, targetId: string, metadata: Record<string, unknown>, now: number) {
    appendAdminAuditLog(this.database, {
      actorUserId: actor.id, actorEmail: actor.email, actorRole: actor.role,
      action, targetType: "admin_user", targetId, metadata, createdAt: now,
    });
  }
}

function toView(value: unknown): AdminUserView {
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id), email: String(row.email), role: row.role as AdminRole,
    displayName: row.display_name === null ? null : String(row.display_name),
    isActive: Boolean(row.is_active), lastLoginAt: row.last_login_at === null ? null : Number(row.last_login_at),
    createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    activeSessions: Number(row.active_sessions),
  };
}

function validateEmail(value: string): string {
  const email = normalizeAdminEmail(value);
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AdminUserError("A valid email address is required.", "INVALID");
  }
  return email;
}

function validateRole(value: AdminRole): AdminRole {
  if (!ADMIN_ROLES.includes(value)) throw new AdminUserError("A valid admin role is required.", "INVALID");
  return value;
}

function validateDisplayName(value: string | null | undefined): string | null {
  const name = value?.trim() || null;
  if (name && name.length > 100) throw new AdminUserError("Display name is too long.", "INVALID");
  return name;
}

function assertHash(value: string): void {
  if (value.length > 500 || !isValidAdminPasswordHash(value)) {
    throw new AdminUserError("A valid encoded scrypt password hash is required; plaintext is not accepted.", "INVALID");
  }
}
