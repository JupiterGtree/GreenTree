import { NextResponse } from "next/server";
import { validateInitData } from "@/lib/telegram/server";
export const runtime = "nodejs";
export async function POST(request: Request) { const raw = await request.text(); if (raw.length > 8_192) return NextResponse.json({ error: "Payload too large" }, { status: 413 }); try { const session = validateInitData((JSON.parse(raw) as { initData?: string }).initData ?? ""); return session ? NextResponse.json({ sessionId: session.sessionId, expiresAt: session.expiresAt }) : NextResponse.json({ error: "Invalid Telegram session" }, { status: 401 }); } catch { return NextResponse.json({ error: "Invalid Telegram session" }, { status: 401 }); } }
