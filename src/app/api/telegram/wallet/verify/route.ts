import { NextResponse } from "next/server";
import { validateInitData } from "@/lib/telegram/server";
import { resolveTelegramSessionUser } from "@/lib/telegram/wallet-data";
import { verifyWalletChallenge } from "@/lib/telegram/wallet-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 24_576) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  try {
    const input = JSON.parse(raw) as { initData?: string; sessionId?: string; challengeId?: string; walletAddress?: string; signature?: string };
    const session = validateInitData(String(input.initData ?? ""));
    const sessionId = String(input.sessionId ?? "");
    if (!session || resolveTelegramSessionUser(sessionId) !== session.telegramUserId) return NextResponse.json({ error: "Invalid Telegram session" }, { status: 401 });
    const result = verifyWalletChallenge({ challengeId: String(input.challengeId ?? ""), telegramUserId: session.telegramUserId, sessionId, walletAddress: String(input.walletAddress ?? ""), signature: String(input.signature ?? "") });
    return NextResponse.json({ verified: true, walletAddress: result.walletAddress });
  } catch (error) {
    const message = error instanceof Error && /signature/i.test(error.message) ? "Invalid wallet signature" : "Wallet verification failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
