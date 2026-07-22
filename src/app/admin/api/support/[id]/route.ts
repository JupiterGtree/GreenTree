import { NextResponse } from "next/server";
import { authorizeSupportRequest } from "@/lib/admin/support-request";
import { SUPPORT_STATUSES, type SupportStatus } from "@/lib/support/repository";
import { SupportService, SupportValidationError } from "@/lib/support/service";
import { telegramApi } from "@/lib/telegram/server";

export const runtime = "nodejs";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeSupportRequest(request, true);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  try {
    const raw = await request.text(); if (raw.length > 8_192) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    const payload = JSON.parse(raw) as { action?: "status" | "note" | "reply"; status?: string; note?: string; reply?: string };
    const service = new SupportService(); const id = (await params).id;
    if (payload.action === "status" && SUPPORT_STATUSES.includes(payload.status as SupportStatus)) return NextResponse.json({ request: service.updateStatus(id, payload.status as SupportStatus, authorization.session.user) });
    if (payload.action === "note") { service.addNote(id, payload.note ?? "", authorization.session.user); return NextResponse.json({ success: true }); }
    if (payload.action === "reply") {
      const result = service.addPublicReply(id, payload.reply ?? "", authorization.session.user);
      if (result.request.channel === "TELEGRAM" && result.request.telegramChatId) {
        try { const sent = await telegramApi("sendMessage", { chat_id: result.request.telegramChatId, text: result.reply }); return NextResponse.json({ success: true, telegramMessageId: (sent as { message_id?: number })?.message_id ?? null }); }
        catch { return NextResponse.json({ success: true, delivery: "FAILED" }); }
      }
      return NextResponse.json({ success: true });
    }
    throw new SupportValidationError(["A valid action is required."]);
  } catch (error) {
    return NextResponse.json({ error: error instanceof SupportValidationError || error instanceof SyntaxError ? "Unable to update support request." : "Unable to update support request." }, { status: 400 });
  }
}
