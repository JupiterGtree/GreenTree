import "server-only";

import { randomUUID } from "node:crypto";
import type { AdminDatabase } from "./database";
import type { AdminRole } from "./database";

export interface AdminAuditEntry {
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: AdminRole | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipHash?: string | null;
  result?: "SUCCESS" | "FAILURE" | "DENIED";
  userAgentSummary?: string | null;
  createdAt?: number;
}

export function appendAdminAuditLog(database: AdminDatabase, entry: AdminAuditEntry): void {
  const action = boundedToken(entry.action, 100);
  if (!action) throw new Error("Audit action is required.");

  database.db.prepare(`
    INSERT INTO admin_audit_logs (
      actor_user_id, actor_email, actor_role, action, target_type, target_id,
      metadata_json, ip_hash, public_id, result, user_agent_summary, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.actorUserId ?? null,
    boundedText(entry.actorEmail, 320),
    entry.actorRole ?? null,
    action,
    boundedToken(entry.targetType, 100),
    boundedText(entry.targetId, 200),
    entry.metadata ? JSON.stringify(sanitizeAuditMetadata(entry.metadata)) : null,
    entry.ipHash ?? null,
    randomUUID(),
    entry.result ?? "SUCCESS",
    boundedText(entry.userAgentSummary, 120),
    entry.createdAt ?? Date.now(),
  );
}

const SENSITIVE_KEY = /(password|secret|token|cookie|authorization|csrf|hash|private|credential|session)/i;

export function sanitizeAuditMetadata(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => sanitizeAuditMetadata(item, depth + 1));
  if (typeof value !== "object") return String(value).slice(0, 100);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).slice(0, 50).map(([key, item]) => [
      key.slice(0, 80),
      SENSITIVE_KEY.test(key) ? "[redacted]" : sanitizeAuditMetadata(item, depth + 1),
    ]),
  );
}

function boundedToken(value: string | null | undefined, max: number): string | null {
  const normalized = value?.trim();
  return normalized && /^[A-Za-z0-9_.:-]+$/.test(normalized) ? normalized.slice(0, max) : null;
}

function boundedText(value: string | null | undefined, max: number): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, max) : null;
}
