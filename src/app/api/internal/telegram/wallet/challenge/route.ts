import { NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { getTelegramDatabase } from "@/lib/telegram/bot-database";
import { verifyTelegramInternalRequest } from "@/lib/telegram/internal-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyTelegramInternalRequest(request, raw)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = JSON.parse(raw) as { telegramUserId?: string | number; sessionId?: string; walletAddress?: string };
    const telegramUserId = String(input.telegramUserId ?? "");
    const sessionId = String(input.sessionId ?? "");
    const walletAddress = String(input.walletAddress ?? "");
    new PublicKey(walletAddress);
    if (!/^\d+$/.test(telegramUserId) || !sessionId) throw new Error("Invalid session.");
    const db = getTelegramDatabase(); const now = Date.now(); const expiresAt = now + 5 * 60_000; const nonce = randomBytes(24).toString("base64url"); const id = randomUUID();
    const message = ["Green Tree wallet ownership verification", "Domain: gtree.land", "Purpose: telegram-wallet-authentication", `Telegram user ID: ${telegramUserId}`, `Session ID: ${sessionId}`, `Wallet address: ${walletAddress}`, `Nonce: ${nonce}`, `Issued at: ${new Date(now).toISOString()}`, `Expires at: ${new Date(expiresAt).toISOString()}`].join("\n");
    db.prepare("INSERT INTO telegram_wallet_challenges (id, telegram_user_id, wallet_address, message, nonce, expires_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, telegramUserId, walletAddress, message, nonce, expiresAt);
    return NextResponse.json({ challengeId: id, walletAddress, message, expiresAt });
  } catch { return NextResponse.json({ error: "Invalid challenge request" }, { status: 400 }); }
}
