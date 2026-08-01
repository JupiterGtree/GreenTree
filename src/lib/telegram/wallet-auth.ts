import "server-only";

import { createPublicKey, randomBytes, randomUUID, verify as verifySignature } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { getTelegramDatabase } from "@/lib/telegram/bot-database";
import { enqueueNotification } from "@/lib/telegram/notification-outbox";

export type WalletChallengeResult = { challengeId: string; walletAddress: string; message: string; expiresAt: number };

export function createWalletChallenge(input: { telegramUserId: string; sessionId: string; walletAddress: string }): WalletChallengeResult {
  if (!/^\d+$/.test(input.telegramUserId) || !/^[A-Za-z0-9_-]{16,80}$/.test(input.sessionId)) throw new Error("Invalid session.");
  const walletAddress = new PublicKey(input.walletAddress).toBase58();
  const db = getTelegramDatabase();
  const now = Date.now();
  const session = db.prepare("SELECT telegram_user_id FROM telegram_sessions WHERE id = ? AND telegram_user_id = ? AND expires_at > ?").get(input.sessionId, input.telegramUserId, now) as { telegram_user_id?: string } | undefined;
  if (!session) throw new Error("Invalid session.");
  const active = Number((db.prepare("SELECT COUNT(*) AS count FROM telegram_wallet_challenges WHERE telegram_user_id = ? AND used_at IS NULL AND expires_at > ?").get(input.telegramUserId, now) as { count: number }).count);
  if (active >= 5) throw new Error("Too many active wallet challenges.");
  const expiresAt = now + 5 * 60_000;
  const nonce = randomBytes(24).toString("base64url");
  const id = randomUUID();
  const message = [
    "Green Tree wallet ownership verification",
    "Domain: gtree.land",
    "Purpose: telegram-wallet-authentication",
    `Telegram user ID: ${input.telegramUserId}`,
    `Session ID: ${input.sessionId}`,
    `Wallet address: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Issued at: ${new Date(now).toISOString()}`,
    `Expires at: ${new Date(expiresAt).toISOString()}`,
  ].join("\n");
  db.prepare("INSERT INTO telegram_wallet_challenges (id, telegram_user_id, wallet_address, message, nonce, expires_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, input.telegramUserId, walletAddress, message, nonce, expiresAt);
  return { challengeId: id, walletAddress, message, expiresAt };
}

export function verifyWalletChallenge(input: { challengeId: string; telegramUserId: string; sessionId: string; walletAddress: string; signature: string }): { walletAddress: string } {
  if (!/^\d+$/.test(input.telegramUserId) || !/^[A-Za-z0-9_-]{16,80}$/.test(input.sessionId)) throw new Error("Invalid session.");
  const address = new PublicKey(input.walletAddress).toBase58();
  const db = getTelegramDatabase();
  const now = Date.now();
  const session = db.prepare("SELECT telegram_user_id FROM telegram_sessions WHERE id = ? AND telegram_user_id = ? AND expires_at > ?").get(input.sessionId, input.telegramUserId, now) as { telegram_user_id?: string } | undefined;
  const row = db.prepare("SELECT * FROM telegram_wallet_challenges WHERE id = ?").get(input.challengeId) as { id: string; telegram_user_id: string; wallet_address: string; message: string; expires_at: number; used_at: number | null } | undefined;
  if (!session || !row || row.used_at || row.expires_at < now || row.telegram_user_id !== input.telegramUserId || row.wallet_address !== address) throw new Error("Challenge expired or invalid");
  const signature = Buffer.from(input.signature, "base64");
  const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(new PublicKey(address).toBytes())]);
  const valid = signature.length === 64 && verifySignature(null, Buffer.from(row.message), createPublicKey({ key: der, format: "der", type: "spki" }), signature);
  if (!valid) throw new Error("Invalid wallet signature");
  db.exec("BEGIN IMMEDIATE");
  try {
    const update = db.prepare("UPDATE telegram_wallet_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL").run(now, row.id) as { changes?: number };
    if (update.changes !== undefined && update.changes !== 1) throw new Error("Challenge replayed");
    db.prepare("INSERT INTO telegram_verified_wallets (telegram_user_id, wallet_address, verified_at) VALUES (?, ?, ?) ON CONFLICT(telegram_user_id, wallet_address) DO UPDATE SET verified_at=excluded.verified_at").run(input.telegramUserId, address, now);
    db.prepare("INSERT INTO telegram_audit_logs (id, telegram_user_id, action, entity_type, entity_id, result, created_at) VALUES (lower(hex(randomblob(16))), ?, 'WALLET_VERIFIED', 'wallet', ?, 'SUCCESS', ?)").run(input.telegramUserId, address, now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  try { enqueueNotification({ eventType: "wallet_verified", entityType: "telegram_wallet", entityId: `${input.telegramUserId}:${address}`, idempotencyKey: `wallet-verified:${input.telegramUserId}:${address}`, payload: { telegramUserId: input.telegramUserId, wallet: address, timestamp: now } }); } catch (error) { console.warn("telegram_wallet_notification_enqueue_failed", { message: String(error).slice(0, 160) }); }
  return { walletAddress: address };
}
