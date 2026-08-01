import { NextResponse } from "next/server";
import { verifyTelegramInternalRequest } from "@/lib/telegram/internal-auth";
import { getWalletPurchaseHistory, resolveVerifiedTelegramWallet } from "@/lib/telegram/wallet-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!verifyTelegramInternalRequest(request, "")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams;
  const telegramUserId = query.get("telegramUserId") ?? "";
  const sessionId = query.get("sessionId") ?? "";
  const wallet = resolveVerifiedTelegramWallet(telegramUserId, sessionId);
  if (!wallet) return NextResponse.json({ error: "Verified wallet required" }, { status: 403 });
  const pageRaw = query.get("page") ?? "1";
  const pageSizeRaw = query.get("pageSize") ?? "10";
  const page = Number(pageRaw);
  const pageSize = Number(pageSizeRaw);
  if (!Number.isInteger(page) || page < 1 || page > 100_000) return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return NextResponse.json({ error: "Invalid page size" }, { status: 400 });
  return NextResponse.json({ wallet, ...getWalletPurchaseHistory(wallet, page, pageSize) });
}
