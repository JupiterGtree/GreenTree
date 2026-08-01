import "server-only";

import { getAdminDatabase } from "@/lib/admin/database";
import { getFoundationTransactions, type FoundationTransaction } from "@/lib/admin/operations-data";
import { enqueueNotification, getOutboxCounts, type NotificationEventType } from "@/lib/telegram/notification-outbox";
import { getTelegramDatabase } from "@/lib/telegram/bot-database";

const CHECKPOINT = "foundation-reporting";
const RECEIPT_CHECKPOINT = "receipt-reporting";

export function discoverFoundationReportingEvents(now = Date.now()): number {
  const db = getTelegramDatabase();
  const checkpoint = db.prepare("SELECT cursor FROM telegram_event_checkpoints WHERE name = ?").get(CHECKPOINT) as { cursor?: string } | undefined;
  if (!checkpoint) {
    db.prepare("INSERT INTO telegram_event_checkpoints (name, cursor, updated_at) VALUES (?, ?, ?)").run(CHECKPOINT, String(now), now);
    seedFoundationStatusCache();
    return 0;
  }
  const cursor = Number(checkpoint.cursor);
  const result = getFoundationTransactions({ view: "ALL", page: 1, pageSize: 100 });
  if (!result.available) return 0;
  let discovered = 0;
  for (const item of result.items) {
    const cached = db.prepare("SELECT status FROM telegram_entity_status_cache WHERE entity_type = 'foundation_quote' AND entity_id = ?").get(item.quoteId) as { status?: string } | undefined;
    const isNewSinceCheckpoint = item.createdAt >= cursor;
    if (!cached && !isNewSinceCheckpoint) {
      cacheFoundationStatus(item, now);
      continue;
    }
    if (cached?.status === item.state) continue;
    if (item.createdAt < cursor && !cached) {
      cacheFoundationStatus(item, now);
      continue;
    }
    for (const eventType of eventsForState(item.state)) {
      const queued = safeEnqueue(eventType, "foundation_quote", item.quoteId, itemPayload(item, eventType));
      if (queued) discovered += 1;
    }
    cacheFoundationStatus(item, now);
  }
  db.prepare("INSERT INTO telegram_event_checkpoints (name, cursor, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET cursor=excluded.cursor, updated_at=excluded.updated_at").run(CHECKPOINT, String(now), now);
  return discovered;
}

export function discoverReceiptReportingEvents(now = Date.now()): number {
  const db = getTelegramDatabase();
  const checkpoint = db.prepare("SELECT cursor FROM telegram_event_checkpoints WHERE name = ?").get(RECEIPT_CHECKPOINT) as { cursor?: string } | undefined;
  if (!checkpoint) {
    db.prepare("INSERT INTO telegram_event_checkpoints (name, cursor, updated_at) VALUES (?, ?, ?)").run(RECEIPT_CHECKPOINT, String(now), now);
    return 0;
  }
  const admin = getAdminDatabase().db;
  const hasTable = admin.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'transaction_receipts'").get();
  if (!hasTable) return 0;
  const rows = admin.prepare("SELECT public_id, transaction_signature, status, amount_gtree, created_at FROM transaction_receipts WHERE created_at >= ? ORDER BY created_at ASC LIMIT 100").all(Number(checkpoint.cursor)) as Array<Record<string, unknown>>;
  let discovered = 0;
  for (const row of rows) {
    if (safeEnqueue("receipt_generated", "transaction_receipt", String(row.public_id), { receiptId: String(row.public_id), transactionSignature: row.transaction_signature, status: row.status, gtree: row.amount_gtree, createdAt: row.created_at })) discovered += 1;
  }
  db.prepare("INSERT INTO telegram_event_checkpoints (name, cursor, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET cursor=excluded.cursor, updated_at=excluded.updated_at").run(RECEIPT_CHECKPOINT, String(now), now);
  return discovered;
}

export function buildAnalyticsSummary(now = Date.now()): Record<string, unknown> {
  const transactions = getFoundationTransactions({ view: "ALL", page: 1, pageSize: 100 });
  const summary = transactions.available ? transactions.summary : null;
  const telegram = getTelegramDatabase();
  const verifiedWallets = Number((telegram.prepare("SELECT COUNT(*) AS count FROM telegram_verified_wallets").get() as { count: number }).count);
  const counts = getOutboxCounts();
  return {
    metrics: {
      quotesCreated: transactions.available ? transactions.total : 0,
      quotesConverted: summary?.confirmedCount ?? 0,
      quotesExpired: transactions.available ? transactions.states.EXPIRED : 0,
      confirmedPurchases: summary?.confirmedCount ?? 0,
      failedPurchases: transactions.available ? transactions.states.FAILED : 0,
      confirmedSolLamports: summary?.confirmedInputLamports ?? "0",
      confirmedGtreeTokenUnits: summary?.confirmedOutputTokenUnits ?? "0",
      verifiedTelegramWallets: verifiedWallets,
      outboxPending: counts.pending,
      outboxRetry: counts.retry,
      outboxDeadLetter: counts.deadLetter,
    },
    timestamp: now,
  };
}

export function enqueueAnalyticsSummary(now = Date.now()): boolean {
  const interval = readPositiveInt("TELEGRAM_ANALYTICS_REPORT_INTERVAL_MS", 3_600_000);
  const bucket = Math.floor(now / interval);
  return safeEnqueue("analytics_summary", "analytics", String(bucket), buildAnalyticsSummary(now));
}

function seedFoundationStatusCache() {
  const result = getFoundationTransactions({ view: "ALL", page: 1, pageSize: 100 });
  if (!result.available) return;
  const db = getTelegramDatabase();
  const statement = db.prepare("INSERT OR IGNORE INTO telegram_entity_status_cache (entity_type, entity_id, status, updated_at) VALUES ('foundation_quote', ?, ?, ?)");
  for (const item of result.items) statement.run(item.quoteId, item.state, Date.now());
}

function cacheFoundationStatus(item: FoundationTransaction, now: number) {
  getTelegramDatabase().prepare("INSERT INTO telegram_entity_status_cache (entity_type, entity_id, status, updated_at) VALUES ('foundation_quote', ?, ?, ?) ON CONFLICT(entity_type, entity_id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at").run(item.quoteId, item.state, now);
}

function eventsForState(state: FoundationTransaction["state"]): NotificationEventType[] {
  if (state === "CREATED") return ["quote_created"];
  if (state === "BUILT") return ["transaction_created", "purchase_initiated"];
  if (state === "SUBMITTED") return ["transaction_submitted"];
  if (state === "CONFIRMED") return ["quote_converted", "transaction_confirmed"];
  if (state === "EXPIRED") return ["quote_expired", "transaction_expired"];
  return ["quote_failed", "transaction_failed"];
}

function itemPayload(item: FoundationTransaction, eventType: NotificationEventType): Record<string, unknown> {
  return {
    quoteId: item.quoteId, wallet: item.buyer, inputSol: item.inputLamports, outputGtree: item.outputTokenUnits,
    status: item.state, transactionSignature: item.signature, createdAt: item.createdAt, updatedAt: item.confirmedAt ?? item.failedAt ?? item.submittedAt ?? item.createdAt,
    explorerUrl: item.signature ? `https://solscan.io/tx/${item.signature}` : undefined, eventType,
  };
}

function safeEnqueue(eventType: NotificationEventType, entityType: string, entityId: string, payload: Record<string, unknown>): boolean {
  try { return enqueueNotification({ eventType, entityType, entityId, idempotencyKey: `${eventType}:${entityId}:${payload.status ?? "created"}`, payload }).inserted; } catch (error) { console.warn("telegram_reporting_enqueue_failed", { eventType, entityId, error: String(error).slice(0, 160) }); return false; }
}

function readPositiveInt(name: string, fallback: number): number { const value = Number(process.env[name]); return Number.isInteger(value) && value > 0 ? value : fallback; }
