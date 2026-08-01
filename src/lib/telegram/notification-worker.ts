import "server-only";

import { closeSync, existsSync, openSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { discoverFoundationReportingEvents, discoverReceiptReportingEvents, enqueueAnalyticsSummary } from "@/lib/telegram/reporting";
import {
  getLatestDeliveredMessage, getPendingNotifications, markNotificationDeadLetter, markNotificationDelivered,
  markNotificationProcessing, markNotificationRetry, recordDeliveryAttempt, updateTelegramMessageId,
  type NotificationRecord,
} from "@/lib/telegram/notification-outbox";
import { formatOperationsNotification } from "@/lib/telegram/notification-format";

export interface WorkerRunResult { discovered: number; attempted: number; delivered: number; retried: number; deadLettered: number; }

export async function runNotificationWorkerOnce(now = Date.now()): Promise<WorkerRunResult> {
  const discovered = discoverFoundationReportingEvents(now) + discoverReceiptReportingEvents(now);
  if (process.env.TELEGRAM_ANALYTICS_REPORT_ENABLED !== "false") {
    try { enqueueAnalyticsSummary(now); } catch (error) { console.warn("telegram_analytics_enqueue_failed", { error: safeError(error) }); }
  }
  const channelConfigured = Boolean(process.env.TELEGRAM_OPERATIONS_CHANNEL_ID?.trim());
  if (!channelConfigured) console.warn("telegram_notification_worker_warning", { category: "operations_channel_not_configured" });
  const pending = channelConfigured ? getPendingNotifications({ now }) : [];
  const result: WorkerRunResult = { discovered, attempted: 0, delivered: 0, retried: 0, deadLettered: 0 };
  for (const notification of pending) {
    if (!markNotificationProcessing(notification.id, now)) continue;
    result.attempted += 1;
    try {
      const messageId = await deliverNotification(notification);
      if (messageId) updateTelegramMessageId(notification.id, messageId);
      markNotificationDelivered(notification.id, now);
      recordDeliveryAttempt(notification.id, true, null, now);
      result.delivered += 1;
    } catch (error) {
      const message = safeError(error);
      const nextAttempt = notification.attempts + 1;
      recordDeliveryAttempt(notification.id, false, message, now);
      if (nextAttempt >= readPositiveInt("TELEGRAM_NOTIFICATION_MAX_ATTEMPTS", 8) || isPermanentError(message)) {
        markNotificationDeadLetter(notification.id, message, now);
        result.deadLettered += 1;
      } else {
        const base = readPositiveInt("TELEGRAM_NOTIFICATION_RETRY_BASE_MS", 5_000);
        const max = readPositiveInt("TELEGRAM_NOTIFICATION_RETRY_MAX_MS", 3_600_000);
        const delay = Math.min(max, base * 2 ** Math.min(nextAttempt - 1, 20));
        markNotificationRetry(notification.id, message, { now, nextAttemptAt: now + delay });
        result.retried += 1;
      }
    }
  }
  return result;
}

export async function startNotificationWorker(): Promise<void> {
  if (process.env.TELEGRAM_NOTIFICATION_WORKER_ENABLED === "false") {
    return;
  }
  const lock = acquireWorkerLock();
  if (!lock) throw new Error("Telegram notification worker is already running.");
  const interval = readPositiveInt("TELEGRAM_NOTIFICATION_WORKER_INTERVAL_MS", 5_000);
  const tick = async () => {
    try { await runNotificationWorkerOnce(); } catch (error) { console.warn("telegram_notification_worker_warning", { category: safeError(error) }); }
  };
  await tick();
  setInterval(() => void tick(), interval);
  await new Promise<void>(() => undefined);
}

async function deliverNotification(notification: NotificationRecord): Promise<string | null> {
  const chatId = notification.telegramChatId ?? process.env.TELEGRAM_OPERATIONS_CHANNEL_ID?.trim();
  if (!chatId) throw new Error("operations_channel_not_configured");
  const text = formatOperationsNotification(notification);
  const previous = getLatestDeliveredMessage(notification.entityType, notification.entityId);
  if (previous) {
    try {
      const edited = await telegramRequest("editMessageText", { chat_id: previous.chatId, message_id: previous.messageId, text, parse_mode: "HTML", disable_web_page_preview: true });
      return String((edited as { message_id?: number }).message_id ?? previous.messageId);
    } catch {
      // A missing/expired message is safe to replace with one new status message.
    }
  }
  const sent = await telegramRequest("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
  const messageId = (sent as { message_id?: number }).message_id;
  return messageId == null ? null : String(messageId);
}

async function telegramRequest(method: string, body: Record<string, unknown>): Promise<unknown> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("telegram_bot_not_configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8_000) });
  const json = await response.json().catch(() => null) as { ok?: boolean; result?: unknown; description?: string } | null;
  if (!response.ok || !json?.ok) throw new Error(`telegram_api_${response.status}_${json?.description ?? "failed"}`);
  return json.result;
}

function acquireWorkerLock(): number | null {
  const path = process.env.TELEGRAM_WORKER_LOCK_PATH?.trim() || join(process.env.TELEGRAM_BOT_DATABASE_PATH?.trim() ? join(process.env.TELEGRAM_BOT_DATABASE_PATH.trim(), "..") : join(process.cwd(), "data"), ".telegram-worker.lock");
  try {
    if (existsSync(path)) return null;
    const fd = openSync(path, "wx");
    const cleanup = () => { try { closeSync(fd); unlinkSync(path); } catch { /* best effort */ } };
    process.once("exit", cleanup); process.once("SIGTERM", () => { cleanup(); process.exit(0); }); process.once("SIGINT", () => { cleanup(); process.exit(0); });
    return fd;
  } catch { return null; }
}

function safeError(error: unknown): string { return (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, " ").slice(0, 180); }
function isPermanentError(message: string): boolean { return /not_configured|operations_channel_not_configured|telegram_api_400|telegram_api_401|telegram_api_403/i.test(message); }
function readPositiveInt(name: string, fallback: number): number { const value = Number(process.env[name]); return Number.isInteger(value) && value > 0 ? value : fallback; }
