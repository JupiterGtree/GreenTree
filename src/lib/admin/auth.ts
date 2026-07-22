import "server-only";

import { appendAdminAuditLog } from "./audit";
import type { AdminDatabase, AdminRole } from "./database";
import { getAdminDatabase } from "./database";
import {
  createCsrfToken,
  generateCsrfSecret,
  generateSessionToken,
  hashSessionToken,
  hashUserAgent,
  hmacIpAddress,
  normalizeAdminEmail,
  verifyAdminPassword,
  verifyCsrfToken,
} from "./security";

const DUMMY_PASSWORD_HASH =
  "scrypt$v=1$N=131072$r=8$p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export interface AdminAuthConfig {
  ipHmacSecret: string;
  absoluteTtlMs: number;
  idleTtlMs: number;
  rotationIntervalMs: number;
  attemptWindowMs: number;
  maxFailedAttempts: number;
  lockoutMs: number;
}

export interface AdminIdentity {
  id: string;
  email: string;
  role: AdminRole;
  displayName: string | null;
}

export interface AdminSession {
  user: AdminIdentity;
  tokenHash: string;
  csrfToken: string;
  createdAt: number;
  lastSeenAt: number;
  idleExpiresAt: number;
  absoluteExpiresAt: number;
  rotatedToken?: string;
}

export type AdminLoginResult =
  | { ok: true; token: string; session: AdminSession }
  | { ok: false; reason: "INVALID_CREDENTIALS" | "LOCKED" | "RATE_LIMITED" };

export interface AdminLoginInput {
  email: string;
  password: string;
  ipAddress: string;
  userAgent?: string | null;
}

const DEFAULT_CONFIG: Omit<AdminAuthConfig, "ipHmacSecret"> = {
  absoluteTtlMs: 12 * 60 * 60 * 1_000,
  idleTtlMs: 30 * 60 * 1_000,
  rotationIntervalMs: 15 * 60 * 1_000,
  attemptWindowMs: 15 * 60 * 1_000,
  maxFailedAttempts: 5,
  lockoutMs: 15 * 60 * 1_000,
};

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: AdminRole;
  display_name: string | null;
  is_active: number;
  failed_login_count: number;
  locked_until: number | null;
}

interface SessionRow extends UserRow {
  token_hash: string;
  csrf_secret: string;
  created_at: number;
  last_seen_at: number;
  idle_expires_at: number;
  absolute_expires_at: number;
  rotated_at: number;
  revoked_at: number | null;
  user_agent_hash: string | null;
}

export class AdminAuthService {
  private readonly config: AdminAuthConfig;

  constructor(
    private readonly database: AdminDatabase,
    options: Partial<AdminAuthConfig> & Pick<AdminAuthConfig, "ipHmacSecret">,
    private readonly now: () => number = Date.now,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...options };
  }

  login(input: AdminLoginInput): AdminLoginResult {
    const now = this.now();
    const email = normalizeAdminEmail(input.email);
    const ipHash = hmacIpAddress(input.ipAddress, this.config.ipHmacSecret);
    const user = this.database.db.prepare(`
      SELECT id, email, password_hash, role, display_name, is_active,
             failed_login_count, locked_until
      FROM admin_users WHERE email = ?
    `).get(email) as UserRow | undefined;

    const recentFailures = this.database.db.prepare(`
      SELECT COUNT(*) AS count
      FROM admin_login_attempts
      WHERE email_normalized = ? AND ip_hash = ? AND succeeded = 0 AND attempted_at >= ?
    `).get(email, ipHash, now - this.config.attemptWindowMs) as { count: number };

    if (Number(recentFailures.count) >= this.config.maxFailedAttempts) {
      this.recordAttempt(email, ipHash, false, "RATE_LIMITED", now);
      this.auditLoginFailure(user, email, "RATE_LIMITED", ipHash, now);
      return { ok: false, reason: "RATE_LIMITED" };
    }

    if (user?.locked_until && user.locked_until > now) {
      this.recordAttempt(email, ipHash, false, "LOCKED", now);
      this.auditLoginFailure(user, email, "LOCKED", ipHash, now);
      return { ok: false, reason: "LOCKED" };
    }

    const validPassword = verifyAdminPassword(input.password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (!user || !user.is_active || !validPassword) {
      this.database.transaction(() => {
        if (user) {
          const nextFailures = user.failed_login_count + 1;
          const lockedUntil =
            nextFailures >= this.config.maxFailedAttempts ? now + this.config.lockoutMs : null;
          this.database.db.prepare(`
            UPDATE admin_users
            SET failed_login_count = ?, locked_until = ?, updated_at = ?
            WHERE id = ?
          `).run(nextFailures, lockedUntil, now, user.id);
        }
        this.recordAttempt(email, ipHash, false, "INVALID_CREDENTIALS", now);
        this.auditLoginFailure(user, email, "INVALID_CREDENTIALS", ipHash, now);
      });
      return { ok: false, reason: "INVALID_CREDENTIALS" };
    }

    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const csrfSecret = generateCsrfSecret();
    const absoluteExpiresAt = now + this.config.absoluteTtlMs;
    const idleExpiresAt = Math.min(now + this.config.idleTtlMs, absoluteExpiresAt);

    this.database.transaction(() => {
      this.database.db.prepare(`
        UPDATE admin_users
        SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ?
        WHERE id = ?
      `).run(now, now, user.id);
      this.recordAttempt(email, ipHash, true, null, now);
      this.database.db.prepare(`
        INSERT INTO admin_sessions (
          token_hash, user_id, csrf_secret, created_at, last_seen_at,
          idle_expires_at, absolute_expires_at, rotated_at, user_agent_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        tokenHash,
        user.id,
        csrfSecret,
        now,
        now,
        idleExpiresAt,
        absoluteExpiresAt,
        now,
        hashUserAgent(input.userAgent ?? null),
      );
      appendAdminAuditLog(this.database, {
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: "ADMIN_LOGIN_SUCCEEDED",
        targetType: "admin_session",
        targetId: tokenHash,
        ipHash,
        createdAt: now,
      });
    });

    return {
      ok: true,
      token,
      session: this.toSession(
        {
          ...user,
          token_hash: tokenHash,
          csrf_secret: csrfSecret,
          created_at: now,
          last_seen_at: now,
          idle_expires_at: idleExpiresAt,
          absolute_expires_at: absoluteExpiresAt,
          rotated_at: now,
          revoked_at: null,
          user_agent_hash: hashUserAgent(input.userAgent ?? null),
        },
      ),
    };
  }

  authenticate(token: string, allowRotation = true): AdminSession | null {
    if (!isPlausibleSessionToken(token)) return null;
    const now = this.now();
    const tokenHash = hashSessionToken(token);
    const row = this.findSession(tokenHash);
    if (!row || !row.is_active || row.revoked_at) return null;

    if (row.idle_expires_at <= now || row.absolute_expires_at <= now) {
      this.database.db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash);
      return null;
    }

    const idleExpiresAt = Math.min(now + this.config.idleTtlMs, row.absolute_expires_at);
    if (allowRotation && now - row.rotated_at >= this.config.rotationIntervalMs) {
      return this.rotateSession(row, idleExpiresAt, now);
    }

    this.database.db.prepare(`
      UPDATE admin_sessions SET last_seen_at = ?, idle_expires_at = ? WHERE token_hash = ?
    `).run(now, idleExpiresAt, tokenHash);
    return this.toSession({ ...row, last_seen_at: now, idle_expires_at: idleExpiresAt });
  }

  verifyCsrf(token: string, suppliedCsrfToken: string): boolean {
    if (!isPlausibleSessionToken(token) || !suppliedCsrfToken) return false;
    const tokenHash = hashSessionToken(token);
    const row = this.database.db.prepare(`
      SELECT csrf_secret, idle_expires_at, absolute_expires_at, revoked_at
      FROM admin_sessions WHERE token_hash = ?
    `).get(tokenHash) as Pick<
      SessionRow,
      "csrf_secret" | "idle_expires_at" | "absolute_expires_at" | "revoked_at"
    > | undefined;
    const now = this.now();
    return Boolean(
      row &&
      !row.revoked_at &&
      row.idle_expires_at > now &&
      row.absolute_expires_at > now &&
      verifyCsrfToken(suppliedCsrfToken, row.csrf_secret, tokenHash),
    );
  }

  logout(token: string, ipAddress?: string): void {
    if (!isPlausibleSessionToken(token)) return;
    const tokenHash = hashSessionToken(token);
    const row = this.findSession(tokenHash);
    if (!row) return;
    const now = this.now();
    const ipHash = ipAddress ? hmacIpAddress(ipAddress, this.config.ipHmacSecret) : null;

    this.database.transaction(() => {
      this.database.db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash);
      appendAdminAuditLog(this.database, {
        actorUserId: row.id,
        actorEmail: row.email,
        actorRole: row.role,
        action: "ADMIN_LOGOUT",
        targetType: "admin_session",
        targetId: tokenHash,
        ipHash,
        createdAt: now,
      });
    });
  }

  private rotateSession(row: SessionRow, idleExpiresAt: number, now: number): AdminSession {
    const rotatedToken = generateSessionToken();
    const rotatedHash = hashSessionToken(rotatedToken);
    const csrfSecret = generateCsrfSecret();

    this.database.transaction(() => {
      this.database.db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(row.token_hash);
      this.database.db.prepare(`
        INSERT INTO admin_sessions (
          token_hash, user_id, csrf_secret, created_at, last_seen_at,
          idle_expires_at, absolute_expires_at, rotated_at, user_agent_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        rotatedHash,
        row.id,
        csrfSecret,
        row.created_at,
        now,
        idleExpiresAt,
        row.absolute_expires_at,
        now,
        row.user_agent_hash,
      );
    });

    return this.toSession(
      {
        ...row,
        token_hash: rotatedHash,
        csrf_secret: csrfSecret,
        last_seen_at: now,
        idle_expires_at: idleExpiresAt,
        rotated_at: now,
      },
      rotatedToken,
    );
  }

  private findSession(tokenHash: string): SessionRow | undefined {
    return this.database.db.prepare(`
      SELECT s.token_hash, s.csrf_secret, s.created_at, s.last_seen_at,
             s.idle_expires_at, s.absolute_expires_at, s.rotated_at,
             s.revoked_at, s.user_agent_hash,
             u.id, u.email, u.password_hash, u.role, u.display_name,
             u.is_active, u.failed_login_count, u.locked_until
      FROM admin_sessions s
      JOIN admin_users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `).get(tokenHash) as SessionRow | undefined;
  }

  private recordAttempt(
    email: string,
    ipHash: string,
    succeeded: boolean,
    failureReason: string | null,
    attemptedAt: number,
  ): void {
    this.database.db.prepare(`
      INSERT INTO admin_login_attempts (
        email_normalized, ip_hash, succeeded, failure_reason, attempted_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(email, ipHash, succeeded ? 1 : 0, failureReason, attemptedAt);
  }

  private auditLoginFailure(
    user: UserRow | undefined,
    attemptedEmail: string,
    reason: "INVALID_CREDENTIALS" | "LOCKED" | "RATE_LIMITED",
    ipHash: string,
    createdAt: number,
  ): void {
    appendAdminAuditLog(this.database, {
      actorUserId: user?.id ?? null,
      actorEmail: user?.email ?? attemptedEmail,
      actorRole: user?.role ?? null,
      action: "ADMIN_LOGIN_FAILED",
      targetType: "admin_session",
      metadata: { reason },
      result: "FAILURE",
      ipHash,
      createdAt,
    });
  }

  private toSession(row: SessionRow, rotatedToken?: string): AdminSession {
    return {
      user: {
        id: row.id,
        email: row.email,
        role: row.role,
        displayName: row.display_name,
      },
      tokenHash: row.token_hash,
      csrfToken: createCsrfToken(row.csrf_secret, row.token_hash),
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      idleExpiresAt: row.idle_expires_at,
      absoluteExpiresAt: row.absolute_expires_at,
      rotatedToken,
    };
  }
}

let singleton: AdminAuthService | undefined;

export function getAdminAuthService(): AdminAuthService {
  const { ipHmacSecret } = readAdminAuthEnvironment();
  singleton ??= new AdminAuthService(getAdminDatabase(), { ipHmacSecret });
  return singleton;
}

export function readAdminAuthEnvironment(
  environment: Partial<Record<"ADMIN_IP_HMAC_SECRET" | "ADMIN_SESSION_SECRET", string | undefined>> =
    process.env as Partial<Record<"ADMIN_IP_HMAC_SECRET" | "ADMIN_SESSION_SECRET", string | undefined>>,
): { ipHmacSecret: string } {
  const ipHmacSecret = environment.ADMIN_IP_HMAC_SECRET ?? "";
  const sessionSecret = environment.ADMIN_SESSION_SECRET ?? "";
  if (sessionSecret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must contain at least 32 characters.");
  }
  if (ipHmacSecret.length < 32) {
    throw new Error("ADMIN_IP_HMAC_SECRET must contain at least 32 characters.");
  }
  return { ipHmacSecret };
}

function isPlausibleSessionToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
