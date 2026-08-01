import { NextResponse } from "next/server";
import { validateInitData } from "@/lib/telegram/server";
import { resolveTelegramSessionUser } from "@/lib/telegram/wallet-data";
import { createWalletChallenge } from "@/lib/telegram/wallet-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 16_384) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  try {
    const input = JSON.parse(raw) as { initData?: string; sessionId?: string; walletAddress?: string };
    const session = validateInitData(String(input.initData ?? ""));
    const sessionId = String(input.sessionId ?? "");
    if (!session || resolveTelegramSessionUser(sessionId) !== session.telegramUserId) return NextResponse.json({ error: "Invalid Telegram session" }, { status: 401 });
    return NextResponse.json(createWalletChallenge({ telegramUserId: session.telegramUserId, sessionId, walletAddress: String(input.walletAddress ?? "") }));
  } catch { return NextResponse.json({ error: "Invalid challenge request" }, { status: 400 }); }
}
