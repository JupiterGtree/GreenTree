import { NextResponse } from "next/server";
import { verifyTelegramInternalRequest } from "@/lib/telegram/internal-auth";
import { verifyWalletChallenge } from "@/lib/telegram/wallet-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyTelegramInternalRequest(request, raw)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = JSON.parse(raw) as { challengeId?: string; telegramUserId?: string | number; sessionId?: string; walletAddress?: string; signature?: string };
    const result = verifyWalletChallenge({ challengeId: String(input.challengeId ?? ""), telegramUserId: String(input.telegramUserId ?? ""), sessionId: String(input.sessionId ?? ""), walletAddress: String(input.walletAddress ?? ""), signature: String(input.signature ?? "") });
    return NextResponse.json({ verified: true, walletAddress: result.walletAddress });
  } catch (error) {
    const message = error instanceof Error && /signature/i.test(error.message) ? "Invalid wallet signature" : "Wallet verification failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
