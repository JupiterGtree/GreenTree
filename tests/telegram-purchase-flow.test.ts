import "./server-only-shim.cjs";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrivateKey, sign as signMessage } from "node:crypto";
import { Keypair } from "@solana/web3.js";

process.env.TELEGRAM_BOT_TOKEN = "test-telegram-token";
process.env.TELEGRAM_BOT_ENABLED = "true";
process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret";
process.env.TELEGRAM_PURCHASE_ENABLED = "true";
process.env.TELEGRAM_WEB_APP_URL = "https://gtree.land";
process.env.TELEGRAM_PURCHASE_PATH = "/market?source=telegram_mini_app&action=buy";
process.env.TELEGRAM_MINI_APP_URL = "https://gtree.land/telegram";
process.env.TELEGRAM_BOT_DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "gtree-telegram-buy-")), "bot.sqlite3");

test("Buy GTREE uses an allowlisted production web app URL", async () => {
  const { buildTelegramWebAppUrl, telegramMenu, telegramConfig } = await import("../src/lib/telegram/server");
  const config = telegramConfig();
  assert.equal(config.purchaseEnabled, true);
  assert.equal(buildTelegramWebAppUrl(), "https://gtree.land/market?source=telegram_mini_app&action=buy");
  const menu = telegramMenu() as { keyboard: Array<Array<{ text: string; web_app?: { url: string } }>> };
  const buy = menu.keyboard.flat().find((button) => button.text === "🛒 Buy GTREE");
  const connect = menu.keyboard.flat().find((button) => button.text === "🔗 Connect Wallet");
  assert.equal(buy?.web_app?.url, "https://gtree.land/market?source=telegram_mini_app&action=buy");
  assert.match(connect?.web_app?.url ?? "", /^https:\/\/gtree\.land\/telegram\?flow=connect$/);
});

test("malformed or off-domain web app URLs are rejected", async () => {
  const { buildTelegramWebAppUrl } = await import("../src/lib/telegram/server");
  assert.equal(buildTelegramWebAppUrl({ baseUrl: "http://gtree.land" }), null);
  assert.equal(buildTelegramWebAppUrl({ baseUrl: "https://evil.example" }), null);
  assert.equal(buildTelegramWebAppUrl({ baseUrl: "not-a-url" }), null);
});

test("wallet challenge and signature verification remain bound to the Telegram session", async () => {
  const { getTelegramDatabase } = await import("../src/lib/telegram/bot-database");
  const { persistTelegramWebAppSession } = await import("../src/lib/telegram/wallet-data");
  const { createWalletChallenge, verifyWalletChallenge } = await import("../src/lib/telegram/wallet-auth");
  const keypair = Keypair.generate();
  const sessionId = "session_1234567890abcdef";
  persistTelegramWebAppSession({ telegramUserId: "12345", sessionId, expiresAt: Date.now() + 60_000 });
  const challenge = createWalletChallenge({ telegramUserId: "12345", sessionId, walletAddress: keypair.publicKey.toBase58() });
  const privateDer = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(keypair.secretKey).subarray(0, 32)]);
  const signature = signMessage(null, Buffer.from(challenge.message), createPrivateKey({ key: privateDer, format: "der", type: "pkcs8" })).toString("base64");
  const verified = verifyWalletChallenge({ challengeId: challenge.challengeId, telegramUserId: "12345", sessionId, walletAddress: keypair.publicKey.toBase58(), signature });
  assert.equal(verified.walletAddress, keypair.publicKey.toBase58());
  assert.throws(() => verifyWalletChallenge({ challengeId: challenge.challengeId, telegramUserId: "12345", sessionId, walletAddress: keypair.publicKey.toBase58(), signature }));
  assert.equal((getTelegramDatabase().prepare("SELECT COUNT(*) AS count FROM telegram_verified_wallets WHERE telegram_user_id = ?").get("12345") as { count: number }).count, 1);
});
