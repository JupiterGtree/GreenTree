import "server-only";

import type { AdminDatabase } from "@/lib/admin/database";
import { getAdminDatabase } from "@/lib/admin/database";

export const PARTNERSHIP_CATEGORIES = [
  "COMMUNITY", "MARKETING", "TECHNOLOGY", "ENVIRONMENTAL", "LIQUIDITY",
  "MEDIA", "EXCHANGE", "RESEARCH", "OTHER",
] as const;
export const PARTNERSHIP_STATUSES = [
  "NEW", "REVIEWING", "CONTACTED", "ACCEPTED", "REJECTED", "ARCHIVED",
] as const;
export type PartnershipCategory = typeof PARTNERSHIP_CATEGORIES[number];
export type PartnershipStatus = typeof PARTNERSHIP_STATUSES[number];

export interface PartnershipRequest {
  id: string;
  requestNumber: string;
  applicantName: string;
  organizationName: string;
  category: PartnershipCategory;
  website: string | null;
  websiteHost: string | null;
  xDisplay: string | null;
  xHandle: string | null;
  telegramDisplay: string | null;
  telegramHandle: string | null;
  email: string | null;
  preferredContactType: "X" | "TELEGRAM" | "EMAIL" | "MULTIPLE" | null;
  normalizedContact: string | null;
  introduction: string;
  collaboration: string;
  supportingLink: string | null;
  duplicateOf: string | null;
  allowResubmission: boolean;
  unread: boolean;
  status: PartnershipStatus;
  assignedUserId: string | null;
  assignedUserEmail: string | null;
  submittedAt: number;
  updatedAt: number;
}

export interface PartnershipListFilters {
  query?: string;
  status?: PartnershipStatus;
  category?: PartnershipCategory;
  from?: number;
  to?: number;
  sort?: "newest" | "oldest";
  page?: number;
  pageSize?: number;
}

interface RequestRow {
  id: string; request_number: string; applicant_name: string; organization_name: string;
  category: PartnershipCategory; website: string | null; website_host: string | null;
  x_display: string | null; x_handle: string | null; telegram_display: string | null;
  telegram_handle: string | null; email: string | null;
  preferred_contact_type: "X" | "TELEGRAM" | "EMAIL" | null; introduction: string;
  collaboration: string; supporting_link: string | null; duplicate_of: string | null;
  allow_resubmission: number; unread: number; status: PartnershipStatus;
  assigned_user_id: string | null; assigned_user_email: string | null;
  submitted_at: number; updated_at: number;
}

const SELECT_REQUEST = `
  SELECT r.*, u.email AS assigned_user_email
  FROM partnership_requests r
  LEFT JOIN admin_users u ON u.id = r.assigned_user_id
`;

export class PartnershipRepository {
  constructor(readonly database: AdminDatabase = getAdminDatabase()) {}

  findById(id: string): PartnershipRequest | null {
    const row = this.database.db.prepare(`${SELECT_REQUEST} WHERE r.id = ?`).get(id) as RequestRow | undefined;
    return row ? hydrate(row) : null;
  }

  findRecentDuplicate(contactFingerprint: string, materialFingerprint: string, since: number) {
    return this.database.db.prepare(`
      SELECT id, request_number, submitted_at, allow_resubmission
      FROM partnership_requests
      WHERE contact_fingerprint = ? AND material_fingerprint = ? AND submitted_at >= ?
      ORDER BY submitted_at DESC LIMIT 1
    `).get(contactFingerprint, materialFingerprint, since) as
      | { id: string; request_number: string; submitted_at: number; allow_resubmission: number }
      | undefined;
  }

  countRecentByIp(ipHash: string, since: number): number {
    const row = this.database.db.prepare(
      "SELECT count(*) AS total FROM partnership_requests WHERE ip_hash = ? AND submitted_at >= ?",
    ).get(ipHash, since) as { total: number };
    return row.total;
  }

  list(filters: PartnershipListFilters = {}): { items: PartnershipRequest[]; total: number; page: number; pageSize: number } {
    const clauses: string[] = [];
    const values: Array<string | number> = [];
    if (filters.query?.trim()) {
      const query = `%${filters.query.trim()}%`;
      clauses.push(`(
        r.request_number LIKE ? OR r.applicant_name LIKE ? OR r.organization_name LIKE ?
        OR r.category LIKE ? OR r.website LIKE ? OR r.website_host LIKE ?
        OR r.x_display LIKE ? OR r.x_handle LIKE ? OR r.telegram_display LIKE ?
        OR r.telegram_handle LIKE ? OR r.email LIKE ? OR r.preferred_contact_type LIKE ?
        OR r.introduction LIKE ? OR r.collaboration LIKE ? OR r.supporting_link LIKE ?
      )`);
      values.push(
        query, query, query, query, query, query, query, query,
        query, query, query, query, query, query, query,
      );
    }
    if (filters.status) { clauses.push("r.status = ?"); values.push(filters.status); }
    if (filters.category) { clauses.push("r.category = ?"); values.push(filters.category); }
    if (filters.from) { clauses.push("r.submitted_at >= ?"); values.push(filters.from); }
    if (filters.to) { clauses.push("r.submitted_at <= ?"); values.push(filters.to); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const total = (this.database.db.prepare(
      `SELECT count(*) AS total FROM partnership_requests r ${where}`,
    ).get(...values) as { total: number }).total;
    const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 1), 100);
    const page = Math.max(filters.page ?? 1, 1);
    const rows = this.database.db.prepare(`
      ${SELECT_REQUEST} ${where}
      ORDER BY r.submitted_at ${filters.sort === "oldest" ? "ASC" : "DESC"}
      LIMIT ? OFFSET ?
    `).all(...values, pageSize, (page - 1) * pageSize) as RequestRow[];
    return { items: rows.map(hydrate), total, page, pageSize };
  }

  timeline(requestId: string) {
    return this.database.db.prepare(`
      SELECT e.id, e.event_type AS eventType, e.from_status AS fromStatus,
        e.to_status AS toStatus, e.metadata_json AS metadataJson, e.created_at AS createdAt,
        u.email AS actorEmail
      FROM partnership_request_events e
      LEFT JOIN admin_users u ON u.id = e.actor_user_id
      WHERE e.request_id = ? ORDER BY e.created_at, e.id
    `).all(requestId) as Array<{
      id: number; eventType: string; fromStatus: string | null; toStatus: string | null;
      metadataJson: string | null; createdAt: number; actorEmail: string | null;
    }>;
  }

  notes(requestId: string) {
    return this.database.db.prepare(`
      SELECT n.id, n.body, n.created_at AS createdAt, n.updated_at AS updatedAt,
        u.email AS authorEmail
      FROM partnership_internal_notes n
      LEFT JOIN admin_users u ON u.id = n.author_user_id
      WHERE n.request_id = ? ORDER BY n.created_at DESC
    `).all(requestId) as Array<{
      id: string; body: string; createdAt: number; updatedAt: number; authorEmail: string | null;
    }>;
  }

  activeAdmins() {
    return this.database.db.prepare(`
      SELECT id, email, role FROM admin_users
      WHERE is_active = 1 AND role IN ('OWNER', 'ADMIN') ORDER BY email
    `).all() as Array<{ id: string; email: string; role: string }>;
  }
}

function hydrate(row: RequestRow): PartnershipRequest {
  const contacts = [
    row.x_handle ? { type: "X" as const, value: `@${row.x_handle}` } : null,
    row.telegram_handle ? { type: "TELEGRAM" as const, value: `@${row.telegram_handle}` } : null,
    row.email ? { type: "EMAIL" as const, value: row.email } : null,
  ].filter((value): value is NonNullable<typeof value> => value !== null);
  const preferred = row.preferred_contact_type
    ? contacts.find((contact) => contact.type === row.preferred_contact_type) ?? contacts[0]
    : contacts[0];
  return {
    id: row.id, requestNumber: row.request_number, applicantName: row.applicant_name,
    organizationName: row.organization_name, category: row.category, website: row.website,
    websiteHost: row.website_host, xDisplay: row.x_display, xHandle: row.x_handle,
    telegramDisplay: row.telegram_display, telegramHandle: row.telegram_handle,
    email: row.email,
    preferredContactType: row.preferred_contact_type ?? (contacts.length > 1 ? "MULTIPLE" : preferred?.type ?? null),
    normalizedContact: contacts.length > 1 && !row.preferred_contact_type
      ? contacts.map((contact) => contact.value).join(" · ")
      : preferred?.value ?? null,
    introduction: row.introduction, collaboration: row.collaboration,
    supportingLink: row.supporting_link, duplicateOf: row.duplicate_of,
    allowResubmission: Boolean(row.allow_resubmission), unread: Boolean(row.unread),
    status: row.status, assignedUserId: row.assigned_user_id,
    assignedUserEmail: row.assigned_user_email, submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
}

let singleton: PartnershipRepository | undefined;
export function getPartnershipRepository() {
  singleton ??= new PartnershipRepository();
  return singleton;
}
