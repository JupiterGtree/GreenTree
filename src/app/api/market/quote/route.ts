import { NextResponse } from "next/server";
import { resolveRuntimeSetting } from "@/lib/admin/runtime-settings";
import { normalizeJupiterQuote } from "@/lib/market/jupiter";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const inputSol = searchParams.get("inputSol") ?? "";
  const slippageBps = Number(searchParams.get("slippageBps"));
  try {
    const purchaseMode = resolveRuntimeSetting("purchaseMode");
    if (purchaseMode === "PAUSED") {
      throw new Error("GTREE purchases are currently paused.");
    }
    if (purchaseMode !== "MARKET") {
      throw new Error("Market quotes are disabled while PURCHASE_MODE is FOUNDATION_DIRECT.");
    }

    return NextResponse.json(await normalizeJupiterQuote(inputSol, slippageBps));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Live quote unavailable." },
      { status: 422 },
    );
  }
}
