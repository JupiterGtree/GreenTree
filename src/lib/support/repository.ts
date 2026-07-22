import "server-only";

import type { AdminDatabase } from "@/lib/admin/database";
import { getAdminDatabase } from "@/lib/admin/database";

export const SUPPORT_TOPICS = ["PURCHASE", "WEBSITE", "GENERAL"] as const;
export const SUPPORT_STATUSES = ["NEW", "REVIEWING", "RESPONDED", "RESOLVED", "CLOSED"] as const;
export type SupportTopic = typeof SUPPORT_TOPICS[number];
export type SupportStatus = typeof SUPPORT_STATUSES[number];

export interface SupportRequest {
  id: string;
  requestNumber: string;
  requesterName: string;
  replyEmail: string;
  topic: SupportTopic;
  message: string;
  channel: "WEB" | "TELEGRAM";
  telegramChatId: string | null;
  unread: boolean;
  status: SupportStatus;
  assignedUserId: string | null;
  assignedUserEmail: string | null;
  submittedAt: number;
  updatedAt: number;
}

interface Row {
  id: string; request_number: string; requester_name: string; reply_email: string;
  topic: SupportTopic; message: string; channel: "WEB" | "TELEGRAM"; telegram_chat_id: string | null; unread: number; status: SupportStatus;
  assigned_user_id: string | null; assigned_user_email: string | null;
  submitted_at: number; updated_at: number;
}

const SELECT = `
  SELECT r.*, u.email AS assigned_user_email
  FROM support_requests r
  LEFT JOIN admin_users u ON u.id = r.assigned_user_id
`;

export class SupportRepository {
  constructor(readonly database: AdminDatabase = getAdminDatabase()) {}

  findById(id: string): SupportRequest | null {
    const row = this.database.db.prepare(`${SELECT} WHERE r.id = ?`).get(id) as Row | undefined;
    return row ? hydrate(row) : null;
  }

  findByFingerprint(fingerprint: string): SupportRequest | null {
    const row = this.database.db.prepare(`${SELECT} WHERE r.fingerprint = ?`).get(fingerprint) as Row | undefined;
    return row ? hydrate(row) : null;
  }

  countRecentByIp(ipHash: string, since: number): number {
    return (this.database.db.prepare(
      "SELECT count(*) AS total FROM support_requests WHERE ip_hash = ? AND submitted_at >= ?",
    ).get(ipHash, since) as { total: number }).total;
  }

  list(filters: { query?: string; status?: SupportStatus; page?: number; pageSize?: number } = {}) {
    const clauses: string[] = [];
    const values: Array<string | number> = [];
    if (filters.query?.trim()) {
      const term = `%${filters.query.trim()}%`;
      clauses.push("(r.request_number LIKE ? OR r.requester_name LIKE ? OR r.reply_email LIKE ? OR r.message LIKE ?)");
      values.push(term, term, term, term);
    }
    if (filters.status) { clauses.push("r.status = ?"); values.push(filters.status); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const total = (this.database.db.prepare(`SELECT count(*) AS total FROM support_requests r ${where}`).get(...values) as { total: number }).total;
    const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 1), 100);
    const page = Math.max(filters.page ?? 1, 1);
    const rows = this.database.db.prepare(`${SELECT} ${where} ORDER BY r.submitted_at DESC LIMIT ? OFFSET ?`)
      .all(...values, pageSize, (page - 1) * pageSize) as Row[];
    return { items: rows.map(hydrate), total, page, pageSize };
  }

  timeline(requestId: string) {
    return this.database.db.prepare(`
      SELECT e.id, e.event_type AS eventType, e.from_status AS fromStatus, e.to_status AS toStatus,
        e.created_at AS createdAt, u.email AS actorEmail
      FROM support_request_events e LEFT JOIN admin_users u ON u.id = e.actor_user_id
      WHERE e.request_id = ? ORDER BY e.created_at, e.id
    `).all(requestId) as Array<{ id: number; eventType: string; fromStatus: string | null; toStatus: string | null; createdAt: number; actorEmail: string | null }>;
  }

  notes(requestId: string) {
    return this.database.db.prepare(`
      SELECT n.id, n.body, n.created_at AS createdAt, u.email AS authorEmail
      FROM support_internal_notes n LEFT JOIN admin_users u ON u.id = n.author_user_id
      WHERE n.request_id = ? ORDER BY n.created_at DESC
    `).all(requestId) as Array<{ id: string; body: string; createdAt: number; authorEmail: string | null }>;
  }
}

function hydrate(row: Row): SupportRequest {
  return {
    id: row.id, requestNumber: row.request_number, requesterName: row.requester_name,
    replyEmail: row.reply_email, topic: row.topic, message: row.message, channel: row.channel ?? "WEB", telegramChatId: row.telegram_chat_id ?? null, unread: Boolean(row.unread),
    status: row.status, assignedUserId: row.assigned_user_id, assignedUserEmail: row.assigned_user_email,
    submittedAt: row.submitted_at, updatedAt: row.updated_at,
  };
}

let singleton: SupportRepository | undefined;
export function getSupportRepository() {
  singleton ??= new SupportRepository();
  return singleton;
}
