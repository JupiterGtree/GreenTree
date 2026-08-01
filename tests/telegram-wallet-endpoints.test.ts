import "./server-only-shim.cjs";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signTelegramInternalRequest } from "../src/lib/telegram/internal-auth";

process.env.TELEGRAM_INTERNAL_API_ENABLED = "true";
process.env.TELEGRAM_INTERNAL_API_SECRET = "test-secret-for-telegram";
process.env.TELEGRAM_BOT_DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "gtree-telegram-")), "bot.sqlite3");

test("wallet purchase endpoint enforces HMAC and verified session identity", async () => {
  const { getTelegramDatabase } = await import("../src/lib/telegram/bot-database");
  const { GET } = await import("../src/app/api/internal/telegram/wallet/purchases/route");
  const db = getTelegramDatabase();
  const now = Date.now();
  db.prepare("INSERT INTO telegram_sessions (id, telegram_user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run("session-1", "123", now + 60_000, now);
  db.prepare("INSERT INTO telegram_verified_wallets (telegram_user_id, wallet_address, verified_at) VALUES (?, ?, ?)").run("123", "11111111111111111111111111111111", now);
  const url = "http://localhost/api/internal/telegram/wallet/purchases?telegramUserId=123&sessionId=session-1&page=1&pageSize=5";
  const unauthorized = await GET(new Request(url));
  assert.equal(unauthorized.status, 401);
  const timestamp = String(Date.now());
  const headers = { "x-telegram-timestamp": timestamp, "x-telegram-nonce": "nonce-1", "x-telegram-signature": signTelegramInternalRequest("GET", "/api/internal/telegram/wallet/purchases", "", timestamp, "nonce-1", process.env.TELEGRAM_INTERNAL_API_SECRET!) };
  const authorized = await GET(new Request(url, { headers }));
  assert.equal(authorized.status, 200);
  const body = await authorized.json() as { wallet: string; total: number };
  assert.equal(body.wallet, "11111111111111111111111111111111");
  assert.equal(body.total, 0);
});

test("purchase endpoint rejects invalid pagination after authentication", async () => {
  const { GET } = await import("../src/app/api/internal/telegram/wallet/purchases/route");
  const url = "http://localhost/api/internal/telegram/wallet/purchases?telegramUserId=123&sessionId=session-1&page=0&pageSize=5";
  const timestamp = String(Date.now());
  const nonce = "nonce-2";
  const response = await GET(new Request(url, { headers: { "x-telegram-timestamp": timestamp, "x-telegram-nonce": nonce, "x-telegram-signature": signTelegramInternalRequest("GET", "/api/internal/telegram/wallet/purchases", "", timestamp, nonce, process.env.TELEGRAM_INTERNAL_API_SECRET!) } }));
  assert.equal(response.status, 400);
});
