import "server-only";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
// @ts-expect-error node:sqlite is available in the production Node runtime.
import { DatabaseSync } from "node:sqlite";

let database: DatabaseSync | undefined;

export function getTelegramDatabase(): DatabaseSync {
  if (database) return database;
  const file = process.env.TELEGRAM_BOT_DATABASE_PATH?.trim() || join(process.cwd(), "data", "telegram-bot.sqlite3");
  mkdirSync(dirname(file), { recursive: true });
  database = new DatabaseSync(file);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS telegram_users (telegram_user_id TEXT PRIMARY KEY, username TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS telegram_sessions (id TEXT PRIMARY KEY, telegram_user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS telegram_wallet_challenges (id TEXT PRIMARY KEY, telegram_user_id TEXT NOT NULL, wallet_address TEXT NOT NULL, message TEXT NOT NULL, nonce TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, used_at INTEGER);
    CREATE TABLE IF NOT EXISTS telegram_verified_wallets (telegram_user_id TEXT NOT NULL, wallet_address TEXT NOT NULL, verified_at INTEGER NOT NULL, PRIMARY KEY (telegram_user_id, wallet_address));
    CREATE TABLE IF NOT EXISTS telegram_conversation_states (telegram_user_id TEXT PRIMARY KEY, state TEXT NOT NULL, payload_json TEXT NOT NULL, expires_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS telegram_callback_tokens (token TEXT PRIMARY KEY, telegram_user_id TEXT NOT NULL, entity_id TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER);
    CREATE TABLE IF NOT EXISTS telegram_distribution_requests (id TEXT PRIMARY KEY, telegram_user_id TEXT NOT NULL, state TEXT NOT NULL, payload_json TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS telegram_notification_outbox (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, entity_id TEXT, idempotency_key TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL, last_error TEXT, telegram_message_id TEXT, telegram_chat_id TEXT, processing_started_at INTEGER, created_at INTEGER NOT NULL, delivered_at INTEGER, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS telegram_notification_attempts (id TEXT PRIMARY KEY, outbox_id TEXT NOT NULL, attempted_at INTEGER NOT NULL, success INTEGER NOT NULL, error TEXT);
    CREATE TABLE IF NOT EXISTS telegram_event_checkpoints (name TEXT PRIMARY KEY, cursor TEXT, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS telegram_entity_status_cache (entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, status TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (entity_type, entity_id));
    CREATE TABLE IF NOT EXISTS telegram_audit_logs (id TEXT PRIMARY KEY, telegram_user_id TEXT, action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, result TEXT NOT NULL, created_at INTEGER NOT NULL);
  `);
  migrateNotificationOutbox(database);
  return database;
}

function migrateNotificationOutbox(db: DatabaseSync) {
  for (const statement of [
    "ALTER TABLE telegram_notification_outbox ADD COLUMN entity_type TEXT",
    "ALTER TABLE telegram_notification_outbox ADD COLUMN telegram_chat_id TEXT",
    "ALTER TABLE telegram_notification_outbox ADD COLUMN processing_started_at INTEGER",
  ]) {
    try { db.exec(statement); } catch (error) {
      if (!/duplicate column name|already exists/i.test(String(error))) throw error;
    }
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_telegram_outbox_due
      ON telegram_notification_outbox(status, next_attempt_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_telegram_outbox_entity
      ON telegram_notification_outbox(entity_id, event_type);
    CREATE INDEX IF NOT EXISTS idx_telegram_attempts_outbox
      ON telegram_notification_attempts(outbox_id, attempted_at);
  `);
}
