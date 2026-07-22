import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { resolveRuntimeSetting } from "@/lib/admin/runtime-settings";
import { prepareJupiterSwap } from "@/lib/market/jupiter";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      wallet?: string;
      inputSol?: string;
      slippageBps?: number;
      expectedMinimumReceivedRaw?: string;
    };
    if (!body.wallet) throw new Error("Connect a valid Solana wallet first.");
    if (typeof body.inputSol !== "string" || typeof body.expectedMinimumReceivedRaw !== "string") {
      throw new Error("Refresh the verified quote before continuing.");
    }
    const wallet = new PublicKey(body.wallet);
    if (!PublicKey.isOnCurve(wallet.toBytes())) throw new Error("Connect a valid user-controlled Solana wallet first.");

    const purchaseMode = resolveRuntimeSetting("purchaseMode");
    if (purchaseMode === "PAUSED") {
      throw new Error("GTREE purchases are currently paused.");
    }
    if (purchaseMode !== "MARKET") {
      throw new Error("Market swap execution is disabled while PURCHASE_MODE is FOUNDATION_DIRECT.");
    }
    const swap = await prepareJupiterSwap(
      body.wallet,
      body.inputSol,
      Number(body.slippageBps),
      body.expectedMinimumReceivedRaw,
    );
    return NextResponse.json(swap);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Swap preparation failed." },
      { status: 422 },
    );
  }
}
