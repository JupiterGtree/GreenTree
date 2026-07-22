import "server-only";

import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { appendAdminAuditLog } from "@/lib/admin/audit";
import type { AdminDatabase } from "@/lib/admin/database";
import { getAdminDatabase } from "@/lib/admin/database";
import {
  PARTNERSHIP_STATUSES, PartnershipRepository,
  type PartnershipRequest, type PartnershipStatus,
} from "./repository";

const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1_000;
const RATE_WINDOW_MS = 60 * 60 * 1_000;
const MAX_PER_IP = 5;
const MIN_COMPLETION_MS = 1_500;
const MAX_URLS = 2;
const URL_PATTERN = /https?:\/\/[^\s]+/gi;

export const PUBLIC_PARTNERSHIP_CATEGORIES = [
  "COMMUNITY", "MARKETING", "TECHNOLOGY", "ENVIRONMENTAL",
  "MEDIA", "EXCHANGE", "RESEARCH", "OTHER",
] as const;
export type PublicPartnershipCategory = typeof PUBLIC_PARTNERSHIP_CATEGORIES[number];
export type PreferredContactType = "X" | "TELEGRAM" | "EMAIL";

export interface PartnershipInput {
  nameOrProject?: string;
  category?: string;
  website?: string;
  contactType?: string;
  contact?: string;
  proposal?: string;
  company?: string;
  startedAt?: number;
}

export interface PartnershipActor { id: string; email: string }

export class PartnershipValidationError extends Error {
  constructor(readonly issues: string[] = ["The request could not be submitted."]) {
    super(issues.join(" "));
    this.name = "PartnershipValidationError";
  }
}
export class PartnershipRateLimitError extends Error {}

interface ServiceOptions {
  secret?: string;
  now?: () => number;
  cooldownMs?: number;
  rateWindowMs?: number;
  maxPerIp?: number;
  minCompletionMs?: number;
}

export class PartnershipService {
  readonly repository: PartnershipRepository;
  private readonly now: () => number;
  private readonly secret: string;
  private readonly cooldownMs: number;
  private readonly rateWindowMs: number;
  private readonly maxPerIp: number;
  private readonly minCompletionMs: number;

  constructor(
    private readonly database: AdminDatabase = getAdminDatabase(),
    options: ServiceOptions = {},
  ) {
    this.repository = new PartnershipRepository(database);
    this.now = options.now ?? Date.now;
    this.secret = options.secret ?? process.env.ADMIN_IP_HMAC_SECRET ?? "";
    if (this.secret.length < 32) throw new Error("Partnership HMAC secret is not configured.");
    this.cooldownMs = options.cooldownMs ?? COOLDOWN_MS;
    this.rateWindowMs = options.rateWindowMs ?? RATE_WINDOW_MS;
    this.maxPerIp = options.maxPerIp ?? MAX_PER_IP;
    this.minCompletionMs = options.minCompletionMs ?? MIN_COMPLETION_MS;
  }

  submit(input: PartnershipInput, ipAddress: string): {
    success: true; duplicate: boolean; requestNumber: string; submittedAt: number;
  } {
    const now = this.now();
    if (input.company?.trim() || !Number.isFinite(input.startedAt) ||
      now - Number(input.startedAt) < this.minCompletionMs) {
      throw new PartnershipValidationError();
    }
    const normalized = validateAndNormalize(input);
    const ipHash = this.hmac(`ip\0${ipAddress || "unknown"}`);
    if (this.repository.countRecentByIp(ipHash, now - this.rateWindowMs) >= this.maxPerIp) {
      throw new PartnershipRateLimitError();
    }
    const contactFingerprint = this.hmac(
      `contact\0${normalized.preferredContactType}\0${normalized.normalizedContact}`,
    );
    const materialFingerprint = this.hmac(`material\0${[
      compact(normalized.nameOrProject), normalized.category, compact(normalized.proposal),
    ].join("\0")}`);
    const id = randomUUID();
    const requestNumber = makeRequestNumber(now);

    return this.database.transaction(() => {
      const previous = this.repository.findRecentDuplicate(
        contactFingerprint, materialFingerprint, now - this.cooldownMs,
      );
      if (previous && !previous.allow_resubmission) {
        return {
          success: true as const, duplicate: true,
          requestNumber: previous.request_number, submittedAt: previous.submitted_at,
        };
      }
      if (previous?.allow_resubmission) {
        const consumed = this.database.db.prepare(`
          UPDATE partnership_requests SET allow_resubmission = 0, updated_at = ?
          WHERE id = ? AND allow_resubmission = 1
        `).run(now, previous.id);
        if (Number(consumed.changes) !== 1) {
          const winner = this.repository.findRecentDuplicate(
            contactFingerprint, materialFingerprint, now - this.cooldownMs,
          );
          if (winner) return {
            success: true as const, duplicate: true,
            requestNumber: winner.request_number, submittedAt: winner.submitted_at,
          };
        } else {
          this.event(
            previous.id, null, "RESUBMISSION_CONSUMED", null, null,
            { source: "public_submission" }, now,
          );
          this.publicAudit(
            "PARTNERSHIP_RESUBMISSION_CONSUMED", previous.id,
            { source: "public_submission" }, ipHash, now,
          );
        }
      }
      const bucket = Math.floor(now / this.cooldownMs);
      const fingerprint = this.hmac(
        `duplicate\0${contactFingerprint}\0${materialFingerprint}\0${bucket}` +
        (previous?.allow_resubmission ? `\0resubmit\0${previous.id}` : ""),
      );
      try {
        this.database.db.prepare(`
          INSERT INTO partnership_requests (
            id, request_number, applicant_name, organization_name, category,
            website, website_host, x_display, x_handle, telegram_display,
            telegram_handle, email, preferred_contact_type, introduction,
            collaboration, supporting_link,
            consent, fingerprint, contact_fingerprint, material_fingerprint,
            duplicate_of, ip_hash, submitted_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, requestNumber, normalized.nameOrProject, normalized.nameOrProject,
          normalized.category, normalized.website, normalized.websiteHost,
          normalized.xDisplay, normalized.xHandle, normalized.telegramDisplay,
          normalized.telegramHandle, normalized.email, normalized.preferredContactType,
          "", normalized.proposal, null, fingerprint,
          contactFingerprint, materialFingerprint, previous?.id ?? null, ipHash, now, now,
        );
        this.database.db.prepare(`
          INSERT INTO partnership_request_events
            (request_id, event_type, to_status, metadata_json, created_at)
          VALUES (?, 'SUBMITTED', 'NEW', ?, ?)
        `).run(id, JSON.stringify({ requestNumber }), now);
        this.publicAudit(
          "PARTNERSHIP_SUBMITTED", id,
          { category: normalized.category, duplicateOf: previous?.id ?? null },
          ipHash, now,
        );
        return { success: true as const, duplicate: false, requestNumber, submittedAt: now };
      } catch (error) {
        if (!String(error).includes("UNIQUE constraint failed")) throw error;
        const existing = this.repository.findRecentDuplicate(
          contactFingerprint, materialFingerprint, now - this.cooldownMs,
        );
        if (!existing) throw error;
        return {
          success: true as const, duplicate: true,
          requestNumber: existing.request_number, submittedAt: existing.submitted_at,
        };
      }
    });
  }

  updateStatus(id: string, status: PartnershipStatus, actor: PartnershipActor): PartnershipRequest {
    if (!PARTNERSHIP_STATUSES.includes(status)) throw new PartnershipValidationError(["Invalid status."]);
    const current = this.mustFind(id);
    const now = this.now();
    this.database.transaction(() => {
      this.database.db.prepare(`
        UPDATE partnership_requests SET status = ?, unread = 0, updated_at = ? WHERE id = ?
      `).run(status, now, id);
      this.event(id, actor.id, "STATUS_CHANGED", current.status, status, null, now);
      this.audit("PARTNERSHIP_STATUS_CHANGED", id, actor, { from: current.status, to: status }, now);
    });
    return this.mustFind(id);
  }

  addNote(id: string, body: string, actor: PartnershipActor): void {
    this.mustFind(id);
    const clean = body.trim();
    if (!clean || clean.length > 5_000) throw new PartnershipValidationError(["Note must contain 1–5,000 characters."]);
    const now = this.now();
    this.database.transaction(() => {
      const noteId = randomUUID();
      this.database.db.prepare(`
        INSERT INTO partnership_internal_notes
          (id, request_id, author_user_id, body, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(noteId, id, actor.id, clean, now, now);
      this.event(id, actor.id, "NOTE_ADDED", null, null, { noteId }, now);
      this.audit("PARTNERSHIP_NOTE_ADDED", id, actor, { noteId }, now);
    });
  }

  assign(id: string, userId: string | null, actor: PartnershipActor): PartnershipRequest {
    const current = this.mustFind(id);
    if (userId) {
      const assignee = this.database.db.prepare(
        "SELECT 1 AS found FROM admin_users WHERE id = ? AND is_active = 1 AND role IN ('OWNER','ADMIN')",
      ).get(userId);
      if (!assignee) throw new PartnershipValidationError(["Assignee is not eligible."]);
    }
    const now = this.now();
    this.database.transaction(() => {
      this.database.db.prepare(
        "UPDATE partnership_requests SET assigned_user_id = ?, unread = 0, updated_at = ? WHERE id = ?",
      ).run(userId, now, id);
      this.event(id, actor.id, "ASSIGNED", null, null, { from: current.assignedUserId, to: userId }, now);
      this.audit("PARTNERSHIP_ASSIGNED", id, actor, { from: current.assignedUserId, to: userId }, now);
    });
    return this.mustFind(id);
  }

  setResubmission(id: string, allow: boolean, actor: PartnershipActor): PartnershipRequest {
    this.mustFind(id);
    const now = this.now();
    this.database.transaction(() => {
      this.database.db.prepare(
        "UPDATE partnership_requests SET allow_resubmission = ?, updated_at = ? WHERE id = ?",
      ).run(allow ? 1 : 0, now, id);
      this.event(id, actor.id, "RESUBMISSION_CHANGED", null, null, { allow }, now);
      this.audit("PARTNERSHIP_RESUBMISSION_CHANGED", id, actor, { allow }, now);
    });
    return this.mustFind(id);
  }

  markRead(id: string, actor: PartnershipActor): PartnershipRequest {
    const current = this.mustFind(id);
    if (!current.unread) return current;
    const now = this.now();
    this.database.transaction(() => {
      this.database.db.prepare(
        "UPDATE partnership_requests SET unread = 0, updated_at = ? WHERE id = ?",
      ).run(now, id);
      this.event(id, actor.id, "MARKED_READ", null, null, null, now);
      this.audit("PARTNERSHIP_MARKED_READ", id, actor, {}, now);
    });
    return this.mustFind(id);
  }

  exportCsv(requests: PartnershipRequest[], actor: PartnershipActor): string {
    const rows = [[
      "Request number", "Submitted", "Status", "Category", "Applicant", "Organization",
      "Email", "X", "Telegram", "Website", "Introduction", "Collaboration", "Supporting link",
    ], ...requests.map((item) => [
      item.requestNumber, new Date(item.submittedAt).toISOString(), item.status, item.category,
      item.applicantName, item.organizationName, item.email ?? "", item.xHandle ?? "",
      item.telegramHandle ?? "", item.website ?? "", item.introduction,
      item.collaboration, item.supportingLink ?? "",
    ])];
    this.audit("PARTNERSHIP_CSV_EXPORTED", null, actor, { count: requests.length }, this.now());
    return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  }

  private hmac(value: string) {
    return createHmac("sha256", this.secret).update(value).digest("hex");
  }
  private mustFind(id: string) {
    const request = this.repository.findById(id);
    if (!request) throw new PartnershipValidationError(["Partnership request was not found."]);
    return request;
  }
  private event(
    id: string, actorId: string | null, type: string, from: string | null, to: string | null,
    metadata: Record<string, unknown> | null, now: number,
  ) {
    this.database.db.prepare(`
      INSERT INTO partnership_request_events
        (request_id, actor_user_id, event_type, from_status, to_status, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, actorId, type, from, to, metadata ? JSON.stringify(metadata) : null, now);
  }
  private audit(
    action: string, id: string | null, actor: PartnershipActor,
    metadata: Record<string, unknown>, now: number,
  ) {
    appendAdminAuditLog(this.database, {
      actorUserId: actor.id, actorEmail: actor.email, action,
      targetType: "partnership_request", targetId: id, metadata, createdAt: now,
    });
  }
  private publicAudit(
    action: string, id: string, metadata: Record<string, unknown>, ipHash: string, now: number,
  ) {
    appendAdminAuditLog(this.database, {
      action, targetType: "partnership_request", targetId: id, metadata, ipHash, createdAt: now,
    });
  }
}

export function normalizeX(value?: string): { display: string | null; handle: string | null } {
  return normalizeHandle(value, ["x.com", "twitter.com"]);
}
export function normalizeTelegram(value?: string): { display: string | null; handle: string | null } {
  return normalizeHandle(value, ["t.me", "telegram.me"]);
}

function normalizeHandle(value: string | undefined, hosts: string[]) {
  const display = value?.trim() || null;
  if (!display) return { display: null, handle: null };
  let candidate = display;
  try {
    const withScheme = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
    const parsed = new URL(withScheme);
    if (hosts.includes(parsed.hostname.toLowerCase().replace(/^www\./, ""))) {
      candidate = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    }
  } catch { /* Treat it as a plain handle. */ }
  const handle = candidate.replace(/^@/, "").split(/[/?#]/, 1)[0].toLowerCase();
  return /^[a-z0-9_]{3,32}$/.test(handle) ? { display, handle } : { display, handle: null };
}

export function validateAndNormalize(input: PartnershipInput) {
  const nameOrProject = clean(input.nameOrProject);
  const proposal = cleanMultiline(input.proposal);
  const category = String(input.category ?? "") as PublicPartnershipCategory;
  const preferredContactType = String(input.contactType ?? "") as PreferredContactType;
  const rawContact = input.contact?.trim() ?? "";
  const x = preferredContactType === "X" ? normalizeX(rawContact) : { display: null, handle: null };
  const telegram = preferredContactType === "TELEGRAM"
    ? normalizeTelegram(rawContact)
    : { display: null, handle: null };
  const email = preferredContactType === "EMAIL" ? normalizeEmail(rawContact) : null;
  const website = normalizeUrl(input.website);
  const issues: string[] = [];
  if (nameOrProject.length < 2 || nameOrProject.length > 180) {
    issues.push("Name or project must contain 2–180 characters.");
  }
  if (!PUBLIC_PARTNERSHIP_CATEGORIES.includes(category)) {
    issues.push("Select a valid partnership category.");
  }
  if (!["X", "TELEGRAM", "EMAIL"].includes(preferredContactType)) {
    issues.push("Select a valid preferred contact method.");
  } else if (!rawContact) {
    issues.push("Contact is required.");
  } else if (preferredContactType === "X" && !x.handle) {
    issues.push("Enter a valid X account.");
  } else if (preferredContactType === "TELEGRAM" && !telegram.handle) {
    issues.push("Enter a valid Telegram account.");
  } else if (preferredContactType === "EMAIL" && !email) {
    issues.push("Enter a valid email address.");
  }
  if (input.website?.trim() && !website) issues.push("Website must be a valid HTTPS URL.");
  if (!proposal) issues.push("Proposal is required.");
  if (proposal.length > 800) issues.push("Proposal must not exceed 800 characters.");
  const text = [proposal, input.website].filter(Boolean).join(" ");
  if ((text.match(URL_PATTERN) ?? []).length > MAX_URLS) issues.push("Too many links were provided.");
  if (issues.length) throw new PartnershipValidationError(issues);
  const normalizedContact = x.handle ?? telegram.handle ?? email;
  if (!normalizedContact) throw new PartnershipValidationError(["Enter a valid contact."]);
  return {
    nameOrProject, category, website, proposal, preferredContactType, normalizedContact,
    websiteHost: website ? new URL(website).hostname.toLowerCase().replace(/^www\./, "") : null,
    xDisplay: x.display, xHandle: x.handle, telegramDisplay: telegram.display,
    telegramHandle: telegram.handle, email,
  };
}

function clean(value?: string) { return value?.trim().replace(/\s+/g, " ") ?? ""; }
function cleanMultiline(value?: string) {
  return value?.trim().replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n") ?? "";
}
function compact(value: string) { return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim(); }
function normalizeEmail(value?: string) {
  const email = value?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254 ? email : null;
}
function normalizeUrl(value?: string) {
  const cleanValue = value?.trim();
  if (!cleanValue) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(cleanValue) ? cleanValue : `https://${cleanValue}`);
    if (url.protocol !== "https:" || !url.hostname) return null;
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch { return null; }
}
function makeRequestNumber(now: number) {
  const date = new Date(now).toISOString().slice(0, 10).replaceAll("-", "");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return `GTP-${date}-${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`;
}
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
