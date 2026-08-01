import "./server-only-shim.cjs";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.TELEGRAM_BOT_DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "gtree-outbox-")), "telegram.sqlite3");
process.env.TELEGRAM_OPERATIONS_CHANNEL_ID = "-100123";
process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_ANALYTICS_REPORT_ENABLED = "false";
process.env.TELEGRAM_NOTIFICATION_MAX_ATTEMPTS = "2";

import * as outbox from "../src/lib/telegram/notification-outbox";
import * as worker from "../src/lib/telegram/notification-worker";
import * as format from "../src/lib/telegram/notification-format";

test("outbox enqueue is idempotent", () => {
  const first = outbox.enqueueNotification({ eventType: "quote_created", entityType: "quote", entityId: "q1", idempotencyKey: "quote-created:q1", payload: { quoteId: "q1" } });
  const second = outbox.enqueueNotification({ eventType: "quote_created", entityType: "quote", entityId: "q1", idempotencyKey: "quote-created:q1", payload: { quoteId: "q1" } });
  assert.equal(first.inserted, true);
  assert.equal(second.inserted, false);
  assert.equal(first.id, second.id);
  assert.equal(outbox.getPendingNotifications().length, 1);
});

test("atomic claim, delivery, and message id persistence", () => {
  const event = outbox.enqueueNotification({ eventType: "transaction_confirmed", entityType: "quote", entityId: "q2", idempotencyKey: "transaction-status:q2:confirmed", payload: { quoteId: "q2", status: "CONFIRMED" } });
  assert.equal(outbox.markNotificationProcessing(event.id), true);
  assert.equal(outbox.markNotificationProcessing(event.id), false);
  assert.equal(outbox.updateTelegramMessageId(event.id, "77"), true);
  assert.equal(outbox.markNotificationDelivered(event.id), true);
  assert.equal(outbox.getPendingNotifications().some((item) => item.id === event.id), false);
});

test("retry backoff state and dead-letter transition are durable", () => {
  const event = outbox.enqueueNotification({ eventType: "quote_failed", entityType: "quote", entityId: "q3", idempotencyKey: "quote-status:q3:failed", payload: { quoteId: "q3" } });
  outbox.markNotificationProcessing(event.id, 1000);
  outbox.recordDeliveryAttempt(event.id, false, "temporary outage", 1000);
  outbox.markNotificationRetry(event.id, "temporary outage", { now: 1000, nextAttemptAt: 6000 });
  assert.equal(outbox.getPendingNotifications({ now: 1001 }).some((item) => item.id === event.id), false);
  assert.equal(outbox.getPendingNotifications({ now: 6000 }).some((item) => item.id === event.id), true);
  outbox.markNotificationProcessing(event.id, 6000);
  outbox.markNotificationDeadLetter(event.id, "permanent failure", 6000);
  assert.equal(outbox.listDeadLetterNotifications().some((item) => item.id === event.id), true);
  assert.equal(outbox.retryDeadLetterNotification(event.id), true);
});

test("stale processing claims are released", () => {
  const event = outbox.enqueueNotification({ eventType: "support_submitted", entityType: "support", entityId: "s1", idempotencyKey: "support-submitted:s1", payload: {} });
  outbox.markNotificationProcessing(event.id, 1000);
  const due = outbox.getPendingNotifications({ now: 200_000, processingTimeoutMs: 100 });
  assert.equal(due.some((item) => item.id === event.id), true);
});

test("worker sends a safe formatted message and records delivery", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, result: { message_id: 88 } }), { status: 200 })) as typeof fetch;
  const event = outbox.enqueueNotification({ eventType: "wallet_verified", entityType: "wallet", entityId: "w1", idempotencyKey: "wallet-verified:1:Wallet", payload: { wallet: "12345678901234567890", status: "verified", note: "<script>" } });
  const result = await worker.runNotificationWorkerOnce(Date.now());
  assert.equal(result.delivered >= 1, true);
  assert.equal(outbox.getPendingNotifications().some((item) => item.id === event.id), false);
  const rendered = format.formatOperationsNotification({ id: "x", eventType: "wallet_verified", entityType: "wallet", entityId: "w", idempotencyKey: "x", payload: { status: "<unsafe>" }, status: "PENDING", attempts: 0, nextAttemptAt: 0, lastError: null, telegramMessageId: null, telegramChatId: "-100123", processingStartedAt: null, createdAt: 0, deliveredAt: null, updatedAt: 0 });
  assert.equal(rendered.includes("&lt;unsafe&gt;"), true);
  globalThis.fetch = originalFetch;
});

test("admin distribution feed formatting exposes Solscan and official receipt", () => {
  const rendered = format.formatOperationsNotification({ id: "dist-event", eventType: "distribution_confirmed", entityType: "token_distribution", entityId: "dist-1", idempotencyKey: "dist-1:confirmed", payload: { distributionId: "dist-1", amountGtree: "1.25", recipient: "RecipientWallet123456789", category: "Community Pool", type: "Community Reward", status: "Confirmed", transactionSignature: "5NfQsignature", explorerUrl: "https://solscan.io/tx/5NfQsignature", receiptId: "ABC2345678", receiptUrl: "https://gtree.land/r/ABC2345678", ownerTelegramId: 1477040584, timestamp: "2026-08-01T12:00:00.000Z" }, status: "PENDING", attempts: 0, nextAttemptAt: 0, lastError: null, telegramMessageId: null, telegramChatId: "-100123", processingStartedAt: null, createdAt: 0, deliveredAt: null, updatedAt: 0 });
  assert.match(rendered, /Green Tree Admin Distribution/);
  assert.match(rendered, /solscan\.io\/tx/);
  assert.match(rendered, /gtree\.land\/r\/ABC2345678/);
  assert.match(rendered, /OWNER Telegram ID/);
});

test("temporary Telegram outage retries and then dead-letters", async () => {
  process.env.TELEGRAM_NOTIFICATION_RETRY_BASE_MS = "1";
  process.env.TELEGRAM_NOTIFICATION_MAX_ATTEMPTS = "2";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: false, description: "unavailable" }), { status: 503 })) as typeof fetch;
  const event = outbox.enqueueNotification({ eventType: "notification_worker_warning", entityType: "worker", entityId: "w2", idempotencyKey: "worker-warning:w2", payload: { category: "temporary" } });
  const first = await worker.runNotificationWorkerOnce(Date.now());
  assert.equal(first.retried >= 1, true);
  const second = await worker.runNotificationWorkerOnce(Date.now() + 10);
  assert.equal(second.deadLettered >= 1 || outbox.listDeadLetterNotifications().some((item) => item.id === event.id), true);
  globalThis.fetch = originalFetch;
});
