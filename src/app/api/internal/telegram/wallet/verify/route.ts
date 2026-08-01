import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { createPublicKey, verify as verifySignature } from "node:crypto";
import { getTelegramDatabase } from "@/lib/telegram/bot-database";
import { verifyTelegramInternalRequest } from "@/lib/telegram/internal-auth";
import { enqueueNotification } from "@/lib/telegram/notification-outbox";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyTelegramInternalRequest(request, raw)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = JSON.parse(raw) as { challengeId?: string; telegramUserId?: string | number; walletAddress?: string; signature?: string };
    const userId = String(input.telegramUserId ?? ""); const address = String(input.walletAddress ?? "");
    const db = getTelegramDatabase(); const row = db.prepare("SELECT * FROM telegram_wallet_challenges WHERE id = ?").get(String(input.challengeId ?? "")) as { id: string; telegram_user_id: string; wallet_address: string; message: string; expires_at: number; used_at: number | null } | undefined;
    if (!row || row.used_at || row.expires_at < Date.now() || row.telegram_user_id !== userId || row.wallet_address !== address || !input.signature) return NextResponse.json({ error: "Challenge expired or invalid" }, { status: 400 });
    const key = new PublicKey(address); const signature = Buffer.from(input.signature, "base64");
    const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(key.toBytes())]);
    const valid = signature.length === 64 && verifySignature(null, Buffer.from(row.message), createPublicKey({ key: der, format: "der", type: "spki" }), signature);
    if (!valid) return NextResponse.json({ error: "Invalid wallet signature" }, { status: 400 });
    db.exec("BEGIN IMMEDIATE"); try { db.prepare("UPDATE telegram_wallet_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL").run(Date.now(), row.id); db.prepare("INSERT INTO telegram_verified_wallets (telegram_user_id, wallet_address, verified_at) VALUES (?, ?, ?) ON CONFLICT(telegram_user_id, wallet_address) DO UPDATE SET verified_at=excluded.verified_at").run(userId, address, Date.now()); db.prepare("INSERT INTO telegram_audit_logs (id, telegram_user_id, action, entity_type, entity_id, result, created_at) VALUES (lower(hex(randomblob(16))), ?, 'WALLET_VERIFIED', 'wallet', ?, 'SUCCESS', ?)").run(userId, address, Date.now()); db.exec("COMMIT"); } catch (error) { db.exec("ROLLBACK"); throw error; }
    try { enqueueNotification({ eventType: "wallet_verified", entityType: "telegram_wallet", entityId: `${userId}:${address}`, idempotencyKey: `wallet-verified:${userId}:${address}`, payload: { telegramUserId: userId, wallet: address, timestamp: Date.now() } }); } catch (error) { console.warn("telegram_wallet_notification_enqueue_failed", { message: String(error).slice(0, 160) }); }
    return NextResponse.json({ verified: true, walletAddress: address });
  } catch { return NextResponse.json({ error: "Wallet verification failed" }, { status: 400 }); }
}
