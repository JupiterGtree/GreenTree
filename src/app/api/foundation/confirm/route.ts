import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { resolveRuntimeSetting } from "@/lib/admin/runtime-settings";
import {
  createFoundationConnection,
  createFoundationDirectConfig,
} from "@/lib/purchase/foundation-direct-server";
import { verifyOnChainSettlement } from "@/lib/purchase/foundation-settlement";
import { invalidateFoundationInventorySnapshot } from "@/lib/purchase/foundation-inventory-server";

export async function POST(request: Request) {
  try {
    const purchaseMode = resolveRuntimeSetting("purchaseMode");
    if (purchaseMode === "PAUSED") throw new Error("GTREE purchases are currently paused.");
    if (purchaseMode !== "FOUNDATION_DIRECT") {
      throw new Error("Foundation direct-sale confirmation is disabled while PURCHASE_MODE is MARKET.");
    }

    const body = (await request.json()) as {
      quoteId?: string;
      buyer?: string;
      signature?: string;
    };

    if (!body.quoteId) throw new Error("quoteId is required.");
    if (!body.buyer) throw new Error("buyer is required.");
    if (!body.signature) throw new Error("signature is required.");

    // Validate PublicKey and signature formats
    const buyerPubKey = new PublicKey(body.buyer);
    const signature = body.signature.trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(signature)) {
      throw new Error("Invalid Solana transaction signature format.");
    }

    const config = createFoundationDirectConfig();
    const store = config.controlStore;
    if (!store) {
      throw new Error("Durable store is unconfigured.");
    }

    // Retrieve quote record
    const quoteRecord = await store.getQuote?.(body.quoteId);
    if (!quoteRecord) {
      throw new Error("Quote not found in persistent store.");
    }

    // Verify buyer match
    if (quoteRecord.buyer !== buyerPubKey.toBase58()) {
      throw new Error("This quote is bound to a different buyer.");
    }

    // If already CONFIRMED, return success immediately (Idempotent)
    if (quoteRecord.status === "CONFIRMED") {
      return NextResponse.json({
        status: "CONFIRMED",
        signature: quoteRecord.txSignature,
        solscanUrl: `https://solscan.io/tx/${quoteRecord.txSignature}`,
      });
    }

    // If EXPIRED or FAILED terminal states, return them
    if (quoteRecord.status === "EXPIRED") {
      return NextResponse.json({
        status: "EXPIRED",
        reason: "This quote has expired.",
      });
    }

    if (quoteRecord.status === "FAILED") {
      return NextResponse.json({
        status: "FAILED",
        reason: quoteRecord.failureReason || "This purchase execution has failed.",
      });
    }

    if (quoteRecord.status === "CREATED") {
      throw new Error("This quote has not been compiled or built into a transaction.");
    }

    // Double-check signature uniqueness across all quotes in the database (prevent duplicate binding)
    if (quoteRecord.txSignature && quoteRecord.txSignature !== signature) {
      throw new Error("This quote is already bound to a different transaction signature.");
    }

    // Atomically transition status BUILT -> SUBMITTED and bind the signature
    if (quoteRecord.status === "BUILT") {
      const boundAndTransitioned = await store.transitionQuoteStatus?.(
        body.quoteId,
        ["BUILT"],
        "SUBMITTED",
        {
          tx_signature: signature,
          submitted_at: Date.now(),
        }
      );
      if (!boundAndTransitioned) {
        throw new Error("Failed to transition quote to SUBMITTED. Quote state was modified.");
      }
    }

    // Re-load the latest state to be safe
    const latestQuote = await store.getQuote?.(body.quoteId);
    if (!latestQuote) {
      throw new Error("Quote record missing after binding signature.");
    }

    // Perform the complete on-chain checklist via Solana RPC
    const connection = createFoundationConnection();
    const checkResult = await verifyOnChainSettlement(connection, signature, latestQuote);

    if (checkResult.status === "CONFIRMED") {
      // Transition status SUBMITTED -> CONFIRMED
      await store.transitionQuoteStatus?.(body.quoteId, ["SUBMITTED"], "CONFIRMED", {
        confirmed_at: Date.now(),
      });
      invalidateFoundationInventorySnapshot();
    } else if (checkResult.status === "FAILED") {
      // Transition status SUBMITTED -> FAILED
      await store.transitionQuoteStatus?.(body.quoteId, ["SUBMITTED"], "FAILED", {
        failed_at: Date.now(),
        failure_reason: checkResult.reason || "On-chain transaction execution failed.",
      });
    }

    return NextResponse.json({
      status: checkResult.status,
      reason: checkResult.reason,
      signature: checkResult.signature,
      solscanUrl: checkResult.solscanUrl,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Foundation confirmation failed." },
      { status: 422 },
    );
  }
}
