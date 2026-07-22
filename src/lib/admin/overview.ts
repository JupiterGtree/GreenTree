import "server-only";

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getAdminDatabase, type AdminDatabase } from "./database";
import {
  getFoundationQuoteSummary,
  type FoundationTransaction,
  type FoundationTransactionState,
  sanitizeFailureReason,
} from "./operations-data";
import { RuntimeSettingsService } from "./runtime-settings";

// @ts-expect-error node:sqlite is available in Node 22.5+, ahead of configured Node 20 types.
import { DatabaseSync } from "node:sqlite";

type Available<T> = { available: true; value: T } | { available: false; reason: "Unavailable" };
type LatestLogin = { email: string; attemptedAt: number; failureReason: string | null };
type LatestNews = { title: string; slug: string; publishedAt: number } | null;
type LatestPartnership = { requestNumber: string; organizationName: string; status: string; submittedAt: number } | null;

export interface AdminOverview {
  runtime: Available<{ purchaseMode: string; emergencyPaused: boolean }>;
  foundation: Available<{
    quotes: number;
    states: Record<FoundationTransactionState, number>;
    confirmedSol: string;
    confirmedGtree: string;
    latestQuote: FoundationTransaction | null;
    latestSuccessfulQuote: FoundationTransaction | null;
    latestConfirmed: FoundationTransaction | null;
    latestFailed: FoundationTransaction | null;
  }>;
  news: Available<{
    counts: Record<"DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED", number>;
    latestPublished: LatestNews;
  }>;
  partnerships: Available<{
    counts: Record<"NEW" | "REVIEWING" | "CONTACTED" | "ACCEPTED" | "REJECTED", number>;
    latestRequest: LatestPartnership;
  }>;
  access: Available<{
    activeSessions: number;
    latestSuccessfulLogin: LatestLogin | null;
    latestFailedLogin: LatestLogin | null;
    latestAuditActions: Array<{ action: string; result: string; actorEmail: string | null; createdAt: number }>;
  }>;
  sqlite: {
    admin: Available<{ journalMode: string; busyTimeoutMs: number }>;
    foundation: Available<{ journalMode: string; busyTimeoutMs: number }>;
  };
}

export function getAdminOverview(
  database: AdminDatabase = getAdminDatabase(),
  now = Date.now(),
): AdminOverview {
  let runtime: AdminOverview["runtime"];
  try {
    const settings = new RuntimeSettingsService(database);
    runtime = {
      available: true,
      value: {
        purchaseMode: String(settings.get("purchaseMode").value),
        emergencyPaused: Boolean(settings.get("emergencyPaused").value),
      },
    };
  } catch {
    runtime = { available: false, reason: "Unavailable" };
  }

  const foundationSource = getFoundationQuoteSummary();
  const foundation: AdminOverview["foundation"] = foundationSource.available
    ? {
        available: true,
        value: {
          quotes: foundationSource.total,
          states: foundationSource.states,
          confirmedSol: atomicToUserUnits(foundationSource.inputLamports, 9),
          confirmedGtree: atomicToUserUnits(foundationSource.outputTokenUnits, 9),
          latestQuote: foundationSource.latestQuote,
          latestSuccessfulQuote: foundationSource.latestSuccessfulQuote,
          latestConfirmed: foundationSource.latestConfirmed,
          latestFailed: foundationSource.latestFailed,
        },
      }
    : { available: false, reason: "Unavailable" };

  let news: AdminOverview["news"];
  try {
    const row = database.db.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'DRAFT' THEN 1 END) AS draft,
        COUNT(CASE WHEN status = 'SCHEDULED' THEN 1 END) AS scheduled,
        COUNT(CASE WHEN status = 'PUBLISHED' THEN 1 END) AS published,
        COUNT(CASE WHEN status = 'ARCHIVED' THEN 1 END) AS archived
      FROM news_posts
    `).get() as Record<string, number>;
    const latest = database.db.prepare(`
      SELECT title, slug, published_at FROM news_posts
      WHERE status = 'PUBLISHED' AND published_at IS NOT NULL
      ORDER BY published_at DESC, updated_at DESC LIMIT 1
    `).get() as Record<string, unknown> | undefined;
    news = {
      available: true,
      value: {
        counts: {
          DRAFT: Number(row.draft), SCHEDULED: Number(row.scheduled),
          PUBLISHED: Number(row.published), ARCHIVED: Number(row.archived),
        },
        latestPublished: latest ? {
          title: String(latest.title), slug: String(latest.slug), publishedAt: Number(latest.published_at),
        } : null,
      },
    };
  } catch {
    news = { available: false, reason: "Unavailable" };
  }

  let partnerships: AdminOverview["partnerships"];
  try {
    const row = database.db.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'NEW' THEN 1 END) AS new_count,
        COUNT(CASE WHEN status = 'REVIEWING' THEN 1 END) AS reviewing,
        COUNT(CASE WHEN status = 'CONTACTED' THEN 1 END) AS contacted,
        COUNT(CASE WHEN status = 'ACCEPTED' THEN 1 END) AS accepted,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) AS rejected
      FROM partnership_requests
    `).get() as Record<string, number>;
    const latest = database.db.prepare(`
      SELECT request_number, organization_name, status, submitted_at
      FROM partnership_requests ORDER BY submitted_at DESC, id DESC LIMIT 1
    `).get() as Record<string, unknown> | undefined;
    partnerships = {
      available: true,
      value: {
        counts: {
          NEW: Number(row.new_count), REVIEWING: Number(row.reviewing),
          CONTACTED: Number(row.contacted), ACCEPTED: Number(row.accepted), REJECTED: Number(row.rejected),
        },
        latestRequest: latest ? {
          requestNumber: String(latest.request_number),
          organizationName: String(latest.organization_name),
          status: String(latest.status),
          submittedAt: Number(latest.submitted_at),
        } : null,
      },
    };
  } catch {
    partnerships = { available: false, reason: "Unavailable" };
  }

  let access: AdminOverview["access"];
  try {
    const active = database.db.prepare(`
      SELECT COUNT(*) AS count FROM admin_sessions
      WHERE revoked_at IS NULL AND idle_expires_at > ? AND absolute_expires_at > ?
    `).get(now, now) as { count: number };
    const successful = latestLogin(database, true);
    const failed = latestLogin(database, false);
    const auditRows = database.db.prepare(`
      SELECT action, result, actor_email, created_at
      FROM admin_audit_logs ORDER BY created_at DESC, id DESC LIMIT 5
    `).all() as Array<Record<string, unknown>>;
    access = {
      available: true,
      value: {
        activeSessions: Number(active.count),
        latestSuccessfulLogin: successful,
        latestFailedLogin: failed,
        latestAuditActions: auditRows.map((row) => ({
          action: String(row.action),
          result: String(row.result),
          actorEmail: typeof row.actor_email === "string" ? row.actor_email : null,
          createdAt: Number(row.created_at),
        })),
      },
    };
  } catch {
    access = { available: false, reason: "Unavailable" };
  }

  const foundationPath = resolve(process.cwd(), "data", "foundation-sale.db");
  const sqlite = {
    admin: sqliteEvidence(database.db, "admin_users"),
    foundation: existsSync(foundationPath)
      ? sqliteEvidencePath(foundationPath, "quotes")
      : { available: false, reason: "Unavailable" } as const,
  };
  return { runtime, foundation, news, partnerships, access, sqlite };
}

function latestLogin(database: AdminDatabase, succeeded: boolean): LatestLogin | null {
  const row = database.db.prepare(`
    SELECT email_normalized, attempted_at, failure_reason
    FROM admin_login_attempts WHERE succeeded = ?
    ORDER BY attempted_at DESC, id DESC LIMIT 1
  `).get(succeeded ? 1 : 0) as Record<string, unknown> | undefined;
  return row ? {
    email: String(row.email_normalized),
    attemptedAt: Number(row.attempted_at),
    failureReason: sanitizeFailureReason(typeof row.failure_reason === "string" ? row.failure_reason : null),
  } : null;
}

function sqliteEvidence(
  database: InstanceType<typeof DatabaseSync>,
  table: string,
): Available<{ journalMode: string; busyTimeoutMs: number }> {
  try {
    if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) {
      return { available: false, reason: "Unavailable" };
    }
    const journal = database.prepare("PRAGMA journal_mode").get() as Record<string, unknown>;
    const timeout = database.prepare("PRAGMA busy_timeout").get() as Record<string, unknown>;
    return {
      available: true,
      value: { journalMode: String(journal.journal_mode), busyTimeoutMs: Number(timeout.timeout ?? timeout.busy_timeout ?? 0) },
    };
  } catch {
    return { available: false, reason: "Unavailable" };
  }
}

function sqliteEvidencePath(path: string, table: string): Available<{ journalMode: string; busyTimeoutMs: number }> {
  let database: InstanceType<typeof DatabaseSync> | undefined;
  try {
    database = new DatabaseSync(path, { readOnly: true });
    database.exec("PRAGMA query_only = ON; PRAGMA busy_timeout = 2000;");
    return sqliteEvidence(database, table);
  } catch {
    return { available: false, reason: "Unavailable" };
  } finally {
    try { database?.close(); } catch { /* Ignore close errors. */ }
  }
}

function atomicToUserUnits(value: string, decimals: number): string {
  if (!/^\d+$/.test(value)) throw new Error("Invalid atomic amount.");
  const padded = value.padStart(decimals + 1, "0");
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${padded.slice(0, -decimals)}.${fraction}` : padded.slice(0, -decimals);
}
