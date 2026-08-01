import { NextResponse } from "next/server";
import { verifyTelegramInternalRequest } from "@/lib/telegram/internal-auth";
import { getOnChainGtreeBalance, getWalletPurchaseSummary, resolveVerifiedTelegramWallet } from "@/lib/telegram/wallet-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const body = "";
  if (!verifyTelegramInternalRequest(request, body)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams;
  const telegramUserId = query.get("telegramUserId") ?? "";
  const sessionId = query.get("sessionId") ?? "";
  const wallet = resolveVerifiedTelegramWallet(telegramUserId, sessionId);
  if (!wallet) return NextResponse.json({ error: "Verified wallet required" }, { status: 403 });
  const [onChain, websitePurchases] = await Promise.all([
    getOnChainGtreeBalance(wallet),
    Promise.resolve(getWalletPurchaseSummary(wallet)),
  ]);
  return NextResponse.json({
    onChain: { wallet, gtreeBalance: onChain.gtreeBalance, rawTokenUnits: onChain.rawTokenUnits, decimals: onChain.decimals, lookupStatus: onChain.lookupStatus },
    websitePurchases: {
      wallet,
      confirmedGtreeTokenUnits: websitePurchases.confirmedGtreeTokenUnits,
      confirmedSolLamports: websitePurchases.confirmedSolLamports,
      confirmedPurchaseCount: websitePurchases.confirmedPurchaseCount,
      pendingPurchaseCount: websitePurchases.pendingPurchaseCount,
      recentPurchases: websitePurchases.latestConfirmedPurchases,
    },
  });
}
