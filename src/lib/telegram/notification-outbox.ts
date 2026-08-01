import "server-only";

import { randomUUID } from "node:crypto";
import { getTelegramDatabase } from "@/lib/telegram/bot-database";

export type NotificationStatus = "PENDING" | "PROCESSING" | "DELIVERED" | "RETRY" | "DEAD_LETTER";
export type NotificationEventType =
  | "quote_created" | "quote_expired" | "quote_converted" | "quote_failed"
  | "purchase_initiated" | "transaction_created" | "transaction_submitted"
  | "transaction_confirmed" | "transaction_failed" | "transaction_expired"
  | "receipt_generated" | "wallet_verified" | "support_submitted"
  | "partnership_submitted" | "analytics_summary" | "notification_worker_warning"
  | "distribution_preview" | "distribution_submitted" | "distribution_confirmed"
  | "distribution_failed" | "distribution_receipt_generated";

export interface NotificationInput {
  eventType: NotificationEventType;
  entityType?: string | null;
  entityId?: string | null;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  telegramChatId?: string | null;
  createdAt?: number;
}

export interface NotificationRecord {
  id: string;
  eventType: NotificationEventType;
  entityType: string | null;
  entityId: string | null;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  telegramMessageId: string | null;
  telegramChatId: string | null;
  processingStartedAt: number | null;
  createdAt: number;
  deliveredAt: number | null;
  updatedAt: number;
}

export function enqueueNotification(input: NotificationInput): { id: string; inserted: boolean } {
  const db = getTelegramDatabase();
  const now = input.createdAt ?? Date.now();
  const id = randomUUID();
  const destination = input.telegramChatId ?? process.env.TELEGRAM_OPERATIONS_CHANNEL_ID?.trim() ?? null;
  db.prepare(`
    INSERT OR IGNORE INTO telegram_notification_outbox
      (id, event_type, entity_type, entity_id, idempotency_key, payload_json, status, attempts,
       next_attempt_at, last_error, telegram_message_id, telegram_chat_id, processing_started_at,
       created_at, delivered_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, NULL, NULL, ?, NULL, ?, NULL, ?)
  `).run(id, input.eventType, input.entityType ?? null, input.entityId ?? null, input.idempotencyKey, JSON.stringify(input.payload), now, destination, now, now);
  const row = db.prepare("SELECT id FROM telegram_notification_outbox WHERE idempotency_key = ?").get(input.idempotencyKey) as { id: string };
  return { id: row.id, inserted: row.id === id };
}

export function getPendingNotifications(options: { now?: number; limit?: number; processingTimeoutMs?: number } = {}): NotificationRecord[] {
  const db = getTelegramDatabase();
  const now = options.now ?? Date.now();
  const timeout = options.processingTimeoutMs ?? readPositiveInt("TELEGRAM_NOTIFICATION_PROCESSING_TIMEOUT_MS", 120_000);
  db.prepare(`UPDATE telegram_notification_outbox
    SET status = 'RETRY', next_attempt_at = ?, processing_started_at = NULL, last_error = COALESCE(last_error, 'stale processing claim'), updated_at = ?
    WHERE status = 'PROCESSING' AND processing_started_at IS NOT NULL AND processing_started_at < ?`).run(now, now, now - timeout);
  const limit = Math.min(100, Math.max(1, options.limit ?? readPositiveInt("TELEGRAM_NOTIFICATION_BATCH_SIZE", 20)));
  const rows = db.prepare(`SELECT * FROM telegram_notification_outbox
    WHERE status IN ('PENDING', 'RETRY') AND next_attempt_at <= ?
    ORDER BY next_attempt_at ASC, created_at ASC LIMIT ?`).all(now, limit) as Array<Record<string, unknown>>;
  return rows.map(mapNotification);
}

export function markNotificationProcessing(id: string, now = Date.now()): boolean {
  const result = getTelegramDatabase().prepare(`UPDATE telegram_notification_outbox
    SET status = 'PROCESSING', processing_started_at = ?, updated_at = ?
    WHERE id = ? AND status IN ('PENDING', 'RETRY')`).run(now, now, id);
  return result.changes > 0;
}

export function markNotificationDelivered(id: string, now = Date.now()): boolean {
  const result = getTelegramDatabase().prepare(`UPDATE telegram_notification_outbox
    SET status = 'DELIVERED', delivered_at = ?, processing_started_at = NULL, last_error = NULL, updated_at = ?
    WHERE id = ? AND status = 'PROCESSING'`).run(now, now, id);
  return result.changes > 0;
}

export function markNotificationRetry(id: string, error: string, options: { now?: number; nextAttemptAt?: number } = {}): boolean {
  const now = options.now ?? Date.now();
  const result = getTelegramDatabase().prepare(`UPDATE telegram_notification_outbox
    SET status = 'RETRY', attempts = attempts + 1, next_attempt_at = ?, last_error = ?, processing_started_at = NULL, updated_at = ?
    WHERE id = ? AND status = 'PROCESSING'`).run(options.nextAttemptAt ?? now, sanitizeError(error), now, id);
  return result.changes > 0;
}

export function markNotificationDeadLetter(id: string, error: string, now = Date.now()): boolean {
  const result = getTelegramDatabase().prepare(`UPDATE telegram_notification_outbox
    SET status = 'DEAD_LETTER', attempts = attempts + 1, last_error = ?, processing_started_at = NULL, updated_at = ?
    WHERE id = ? AND status = 'PROCESSING'`).run(sanitizeError(error), now, id);
  return result.changes > 0;
}

export function recordDeliveryAttempt(outboxId: string, success: boolean, error?: string | null, attemptedAt = Date.now()): void {
  getTelegramDatabase().prepare(`INSERT INTO telegram_notification_attempts (id, outbox_id, attempted_at, success, error) VALUES (?, ?, ?, ?, ?)`).run(randomUUID(), outboxId, attemptedAt, success ? 1 : 0, error ? sanitizeError(error) : null);
}

export function updateTelegramMessageId(id: string, messageId: string): boolean {
  const result = getTelegramDatabase().prepare("UPDATE telegram_notification_outbox SET telegram_message_id = ?, updated_at = ? WHERE id = ?").run(messageId, Date.now(), id);
  return result.changes > 0;
}

export function getLatestDeliveredMessage(entityType: string | null, entityId: string | null): { chatId: string; messageId: string } | null {
  if (!entityType || !entityId) return null;
  const row = getTelegramDatabase().prepare(`SELECT telegram_chat_id, telegram_message_id FROM telegram_notification_outbox
    WHERE entity_type = ? AND entity_id = ? AND status = 'DELIVERED' AND telegram_chat_id IS NOT NULL AND telegram_message_id IS NOT NULL
    ORDER BY delivered_at DESC LIMIT 1`).get(entityType, entityId) as { telegram_chat_id?: string; telegram_message_id?: string } | undefined;
  return row?.telegram_chat_id && row.telegram_message_id ? { chatId: row.telegram_chat_id, messageId: row.telegram_message_id } : null;
}

export function listDeadLetterNotifications(limit = 25): NotificationRecord[] {
  const rows = getTelegramDatabase().prepare("SELECT * FROM telegram_notification_outbox WHERE status = 'DEAD_LETTER' ORDER BY updated_at DESC LIMIT ?").all(Math.min(100, Math.max(1, limit))) as Array<Record<string, unknown>>;
  return rows.map(mapNotification);
}

export function retryDeadLetterNotification(id: string): boolean {
  const result = getTelegramDatabase().prepare("UPDATE telegram_notification_outbox SET status = 'RETRY', next_attempt_at = ?, processing_started_at = NULL, updated_at = ? WHERE id = ? AND status = 'DEAD_LETTER'").run(Date.now(), Date.now(), id);
  return result.changes > 0;
}

export function getOutboxCounts(): { pending: number; retry: number; deadLetter: number } {
  const rows = getTelegramDatabase().prepare("SELECT status, COUNT(*) AS count FROM telegram_notification_outbox GROUP BY status").all() as Array<{ status: string; count: number }>;
  const counts = { pending: 0, retry: 0, deadLetter: 0 };
  for (const row of rows) {
    if (row.status === "PENDING") counts.pending = Number(row.count);
    if (row.status === "RETRY") counts.retry = Number(row.count);
    if (row.status === "DEAD_LETTER") counts.deadLetter = Number(row.count);
  }
  return counts;
}

function mapNotification(row: Record<string, unknown>): NotificationRecord {
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(String(row.payload_json)) as Record<string, unknown>; } catch { /* malformed payload remains empty and safe */ }
  return {
    id: String(row.id), eventType: String(row.event_type) as NotificationEventType,
    entityType: row.entity_type == null ? null : String(row.entity_type), entityId: row.entity_id == null ? null : String(row.entity_id),
    idempotencyKey: String(row.idempotency_key), payload, status: String(row.status) as NotificationStatus,
    attempts: Number(row.attempts), nextAttemptAt: Number(row.next_attempt_at), lastError: row.last_error == null ? null : String(row.last_error),
    telegramMessageId: row.telegram_message_id == null ? null : String(row.telegram_message_id), telegramChatId: row.telegram_chat_id == null ? null : String(row.telegram_chat_id),
    processingStartedAt: row.processing_started_at == null ? null : Number(row.processing_started_at), createdAt: Number(row.created_at), deliveredAt: row.delivered_at == null ? null : Number(row.delivered_at), updatedAt: Number(row.updated_at),
  };
}

function sanitizeError(value: string): string {
  return value.replace(/[\r\n]+/g, " ").slice(0, 240);
}

function readPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
