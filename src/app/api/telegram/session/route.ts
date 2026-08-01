import { NextResponse } from "next/server";
import { validateInitData } from "@/lib/telegram/server";
import { persistTelegramWebAppSession } from "@/lib/telegram/wallet-data";
export const runtime = "nodejs";
export async function POST(request: Request) { const raw = await request.text(); if (raw.length > 8_192) return NextResponse.json({ error: "Payload too large" }, { status: 413 }); try { const session = validateInitData((JSON.parse(raw) as { initData?: string }).initData ?? ""); if (!session) return NextResponse.json({ error: "Invalid Telegram session" }, { status: 401 }); persistTelegramWebAppSession({ telegramUserId: session.telegramUserId, sessionId: session.sessionId, expiresAt: session.expiresAt, username: session.username }); return NextResponse.json({ sessionId: session.sessionId, expiresAt: session.expiresAt }); } catch { return NextResponse.json({ error: "Invalid Telegram session" }, { status: 401 }); } }
