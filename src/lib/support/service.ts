import "server-only";

import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { appendAdminAuditLog } from "@/lib/admin/audit";
import type { AdminDatabase } from "@/lib/admin/database";
import { getAdminDatabase } from "@/lib/admin/database";
import { SUPPORT_STATUSES, SupportRepository, type SupportRequest, type SupportStatus, type SupportTopic } from "./repository";

const TOPIC_MAP: Record<string, SupportTopic> = {
  "Purchase, wallet, or transaction": "PURCHASE", "Website or account issue": "WEBSITE", "General support": "GENERAL",
};
const WINDOW_MS = 60 * 60 * 1_000;
const MAX_PER_IP = 5;
const MIN_COMPLETION_MS = 1_000;

export interface SupportInput { name?: string; email?: string; subject?: string; message?: string; company?: string; startedAt?: number }
export interface SupportActor { id: string; email: string; role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER" }
export class SupportValidationError extends Error { constructor(readonly issues = ["The support request could not be submitted."]) { super(issues.join(" ")); } }
export class SupportRateLimitError extends Error {}

export class SupportService {
  readonly repository: SupportRepository;
  private readonly secret: string;
  constructor(private readonly database: AdminDatabase = getAdminDatabase()) {
    this.repository = new SupportRepository(database);
    this.secret = process.env.ADMIN_IP_HMAC_SECRET ?? "";
    if (this.secret.length < 32) throw new Error("Support request HMAC secret is not configured.");
  }

  submit(input: SupportInput, ipAddress: string) {
    const now = Date.now();
    if (input.company?.trim() || !Number.isFinite(input.startedAt) || now - Number(input.startedAt) < MIN_COMPLETION_MS) throw new SupportValidationError();
    const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
    const email = String(input.email ?? "").trim().toLowerCase();
    const message = String(input.message ?? "").trim();
    const topic = TOPIC_MAP[String(input.subject ?? "")] ?? "GENERAL";
    if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || message.length < 10 || message.length > 2_000) throw new SupportValidationError();
    const ipHash = this.hmac(`ip\0${ipAddress || "unknown"}`);
    if (this.repository.countRecentByIp(ipHash, now - WINDOW_MS) >= MAX_PER_IP) throw new SupportRateLimitError();
    const fingerprint = this.hmac(`support\0${email}\0${topic}\0${message.toLowerCase().replace(/\s+/g, " ")}`);
    const duplicate = this.repository.findByFingerprint(fingerprint);
    if (duplicate) return { success: true as const, duplicate: true, requestNumber: duplicate.requestNumber };
    const id = randomUUID();
    const requestNumber = `GTS-${randomBytes(5).toString("hex").toUpperCase()}`;
    this.database.transaction(() => {
      this.database.db.prepare(`
        INSERT INTO support_requests (id, request_number, requester_name, reply_email, topic, message, fingerprint, ip_hash, submitted_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, requestNumber, name, email, topic, message, fingerprint, ipHash, now, now);
      this.database.db.prepare(`INSERT INTO support_request_events (request_id, event_type, to_status, created_at) VALUES (?, 'SUBMITTED', 'NEW', ?)`)
        .run(id, now);
    });
    return { success: true as const, duplicate: false, requestNumber };
  }

  submitTelegram(input: { userHash: string; chatId: string; chatHash: string; username?: string; topic: SupportTopic; message: string; reference?: string }) {
    const now = Date.now();
    const text = `${input.message.trim()}${input.reference?.trim() ? `\n\nReference: ${input.reference.trim()}` : ""}`;
    if (!/^[a-f0-9]{32,128}$/i.test(input.userHash) || !input.chatId || text.length < 10 || text.length > 2_500) throw new SupportValidationError();
    const fingerprint = this.hmac(`telegram-support\0${input.userHash}\0${input.topic}\0${text.toLowerCase().replace(/\s+/g, " ")}`);
    const existing = this.repository.findByFingerprint(fingerprint);
    if (existing) return { success: true as const, duplicate: true, requestNumber: existing.requestNumber };
    const id = randomUUID(); const requestNumber = `GTS-${randomBytes(5).toString("hex").toUpperCase()}`;
    this.database.transaction(() => {
      this.database.db.prepare(`INSERT INTO support_requests (id, request_number, requester_name, reply_email, topic, message, fingerprint, ip_hash, channel, telegram_user_hash, telegram_username, telegram_chat_hash, telegram_chat_id, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'TELEGRAM', ?, ?, ?, ?, ?, ?)`)
        .run(id, requestNumber, input.username ? `@${input.username.slice(0, 64)}` : "Telegram user", `telegram-${input.userHash.slice(0, 16)}@invalid.local`, input.topic, text, fingerprint, this.hmac(`telegram-ip\0${input.userHash}`), input.userHash, input.username?.slice(0, 64) ?? null, input.chatHash, input.chatId, now, now);
      this.database.db.prepare("INSERT INTO support_request_events (request_id, event_type, to_status, metadata_json, created_at) VALUES (?, 'SUBMITTED_TELEGRAM', 'NEW', ?, ?)").run(id, JSON.stringify({ channel: "TELEGRAM" }), now);
    });
    return { success: true as const, duplicate: false, requestNumber };
  }

  updateStatus(id: string, status: SupportStatus, actor: SupportActor): SupportRequest {
    if (!SUPPORT_STATUSES.includes(status)) throw new SupportValidationError(["Invalid status."]);
    const current = this.mustFind(id); const now = Date.now();
    this.database.transaction(() => {
      this.database.db.prepare("UPDATE support_requests SET status = ?, unread = 0, updated_at = ? WHERE id = ?").run(status, now, id);
      this.database.db.prepare("INSERT INTO support_request_events (request_id, actor_user_id, event_type, from_status, to_status, created_at) VALUES (?, ?, 'STATUS_CHANGED', ?, ?, ?)").run(id, actor.id, current.status, status, now);
      appendAdminAuditLog(this.database, { actorUserId: actor.id, actorEmail: actor.email, actorRole: actor.role, action: "SUPPORT_STATUS_CHANGED", targetType: "SUPPORT_REQUEST", targetId: id, metadata: { from: current.status, to: status }, createdAt: now });
    });
    return this.mustFind(id);
  }

  addNote(id: string, body: string, actor: SupportActor): void {
    this.mustFind(id); const note = body.trim(); if (!note || note.length > 5_000) throw new SupportValidationError(["Note must contain 1–5,000 characters."]);
    const now = Date.now();
    this.database.transaction(() => {
      this.database.db.prepare("INSERT INTO support_internal_notes (id, request_id, author_user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(randomUUID(), id, actor.id, note, now, now);
      this.database.db.prepare("INSERT INTO support_request_events (request_id, actor_user_id, event_type, created_at) VALUES (?, ?, 'NOTE_ADDED', ?)").run(id, actor.id, now);
    });
  }

  addPublicReply(id: string, body: string, actor: SupportActor) {
    const request = this.mustFind(id); const reply = body.trim(); if (!reply || reply.length > 3_000) throw new SupportValidationError(["Reply must contain 1–3,000 characters."]);
    const now = Date.now();
    this.database.transaction(() => {
      this.database.db.prepare("INSERT INTO support_request_events (request_id, actor_user_id, event_type, metadata_json, created_at) VALUES (?, ?, 'PUBLIC_REPLY_STORED', ?, ?)").run(id, actor.id, JSON.stringify({ length: reply.length, channel: request.channel }), now);
      this.database.db.prepare("UPDATE support_requests SET status = 'RESPONDED', unread = 0, updated_at = ? WHERE id = ?").run(now, id);
    });
    return { request, reply };
  }

  private mustFind(id: string) { const item = this.repository.findById(id); if (!item) throw new SupportValidationError(["Support request was not found."]); return item; }
  private hmac(value: string) { return createHmac("sha256", this.secret).update(value).digest("hex"); }
}
