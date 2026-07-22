import "server-only";

import { appendAdminAuditLog, sanitizeAuditMetadata } from "./audit";
import type { AdminIdentity } from "./auth";
import { getAdminDatabase, type AdminDatabase, type AdminRole } from "./database";
import { requireAdminPermission } from "./permissions";

export interface AuditFilters {
  actor?: string;
  action?: string;
  entity?: string;
  result?: "SUCCESS" | "FAILURE" | "DENIED";
  from?: number;
  to?: number;
  page?: number;
  pageSize?: number;
}

export interface AuditRecord {
  id: string;
  actorEmail: string | null;
  actorRole: AdminRole | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  result: string;
  metadata: unknown;
  userAgentSummary: string | null;
  createdAt: number;
}

export class AuditLogService {
  constructor(
    private readonly database: AdminDatabase = getAdminDatabase(),
    private readonly now: () => number = Date.now,
  ) {}

  list(filters: AuditFilters, actor: AdminIdentity) {
    requireAdminPermission(actor.role, "audit.read");
    const normalized = normalizeFilters(filters);
    const { where, parameters } = buildWhere(normalized);
    const total = Number((this.database.db.prepare(
      `SELECT COUNT(*) AS count FROM admin_audit_logs ${where}`,
    ).get(...parameters) as { count: number }).count);
    const offset = (normalized.page - 1) * normalized.pageSize;
    const rawRows = this.database.db.prepare(`
      SELECT public_id, actor_email, actor_role, action, target_type, target_id,
             result, metadata_json, user_agent_summary, created_at
      FROM admin_audit_logs ${where}
      ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
    `).all(...parameters, normalized.pageSize, offset) as unknown[];
    const rows = rawRows.map(toRecord);
    return { items: rows, total, page: normalized.page, pageSize: normalized.pageSize };
  }

  exportCsv(filters: AuditFilters, actor: AdminIdentity): string {
    requireAdminPermission(actor.role, "admin.users.manage");
    const normalized = normalizeFilters({ ...filters, page: 1, pageSize: 10_000 }, 10_000);
    const { where, parameters } = buildWhere(normalized);
    const rawRows = this.database.db.prepare(`
      SELECT public_id, actor_email, actor_role, action, target_type, target_id,
             result, metadata_json, user_agent_summary, created_at
      FROM admin_audit_logs ${where}
      ORDER BY created_at DESC, id DESC LIMIT 10000
    `).all(...parameters) as unknown[];
    const rows = rawRows.map(toRecord);
    appendAdminAuditLog(this.database, {
      actorUserId: actor.id, actorEmail: actor.email, actorRole: actor.role,
      action: "AUDIT_LOG_EXPORTED", targetType: "admin_audit_log",
      result: "SUCCESS", metadata: { filters: normalized, rowCount: rows.length }, createdAt: this.now(),
    });
    return [
      ["id", "timestamp", "actor", "actor_role", "action", "entity", "entity_id", "result", "metadata", "user_agent"],
      ...rows.map((row) => [
        row.id, new Date(row.createdAt).toISOString(), row.actorEmail ?? "", row.actorRole ?? "",
        row.action, row.entity ?? "", row.entityId ?? "", row.result,
        JSON.stringify(row.metadata ?? {}), row.userAgentSummary ?? "",
      ]),
    ].map((columns) => columns.map(csvCell).join(",")).join("\r\n");
  }
}

function normalizeFilters(filters: AuditFilters, maximumPageSize = 100) {
  const page = boundedInteger(filters.page, 1, 1, 100_000);
  const pageSize = boundedInteger(filters.pageSize, 25, 1, maximumPageSize);
  return {
    actor: bounded(filters.actor, 320), action: boundedToken(filters.action, 100),
    entity: boundedToken(filters.entity, 100), result: filters.result,
    from: validTime(filters.from), to: validTime(filters.to), page, pageSize,
  };
}

function buildWhere(filters: ReturnType<typeof normalizeFilters>) {
  const clauses: string[] = [];
  const parameters: Array<string | number> = [];
  if (filters.actor) { clauses.push("actor_email LIKE ? ESCAPE '\\'"); parameters.push(`%${escapeLike(filters.actor)}%`); }
  if (filters.action) { clauses.push("action = ?"); parameters.push(filters.action); }
  if (filters.entity) { clauses.push("target_type = ?"); parameters.push(filters.entity); }
  if (filters.result) { clauses.push("result = ?"); parameters.push(filters.result); }
  if (filters.from !== undefined) { clauses.push("created_at >= ?"); parameters.push(filters.from); }
  if (filters.to !== undefined) { clauses.push("created_at <= ?"); parameters.push(filters.to); }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", parameters };
}

function toRecord(value: unknown): AuditRecord {
  const row = value as Record<string, unknown>;
  let metadata: unknown = null;
  try { metadata = row.metadata_json ? sanitizeAuditMetadata(JSON.parse(String(row.metadata_json))) : null; } catch { metadata = null; }
  return {
    id: String(row.public_id), actorEmail: row.actor_email ? String(row.actor_email) : null,
    actorRole: row.actor_role as AdminRole | null, action: String(row.action),
    entity: row.target_type ? String(row.target_type) : null,
    entityId: row.target_id ? String(row.target_id) : null, result: String(row.result),
    metadata, userAgentSummary: row.user_agent_summary ? String(row.user_agent_summary) : null,
    createdAt: Number(row.created_at),
  };
}

function bounded(value: string | undefined, max: number) { const text = value?.trim(); return text ? text.slice(0, max) : undefined; }
function boundedToken(value: string | undefined, max: number) {
  const text = bounded(value, max);
  return text && /^[A-Za-z0-9_.:-]+$/.test(text) ? text : undefined;
}
function boundedInteger(value: number | undefined, fallback: number, min: number, max: number) {
  return Number.isSafeInteger(value) ? Math.min(Math.max(value!, min), max) : fallback;
}
function validTime(value: number | undefined) { return Number.isSafeInteger(value) && value! >= 0 ? value : undefined; }
function escapeLike(value: string) { return value.replace(/[\\%_]/g, "\\$&"); }
function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, "\"\"")}"`;
}
