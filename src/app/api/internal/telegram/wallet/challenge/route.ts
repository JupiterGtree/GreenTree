import { NextResponse } from "next/server";
import { verifyTelegramInternalRequest } from "@/lib/telegram/internal-auth";
import { createWalletChallenge } from "@/lib/telegram/wallet-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyTelegramInternalRequest(request, raw)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = JSON.parse(raw) as { telegramUserId?: string | number; sessionId?: string; walletAddress?: string };
    const result = createWalletChallenge({ telegramUserId: String(input.telegramUserId ?? ""), sessionId: String(input.sessionId ?? ""), walletAddress: String(input.walletAddress ?? "") });
    return NextResponse.json(result);
  } catch { return NextResponse.json({ error: "Invalid challenge request" }, { status: 400 }); }
}
