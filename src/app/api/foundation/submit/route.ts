import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { resolveRuntimeSetting } from "@/lib/admin/runtime-settings";
import {
  createFoundationConnection,
  createFoundationDirectConfig,
} from "@/lib/purchase/foundation-direct-server";
import {
  addAndVerifyFoundationDelegateSignature,
  assertFoundationSimulationSucceeded,
  decodeAndVerifyBuyerSignedFoundationSubmission,
} from "@/lib/purchase/foundation-submission";

export async function POST(request: Request) {
  try {
    if (resolveRuntimeSetting("purchaseMode") !== "FOUNDATION_DIRECT") {
      throw new Error("Foundation direct-sale submission is unavailable in the current purchase mode.");
    }
    if (resolveRuntimeSetting("emergencyPaused")) {
      throw new Error("Foundation direct sales are emergency-paused.");
    }

    const body = (await request.json()) as { quoteId?: string; buyer?: string; transaction?: string };
    if (!body.quoteId || !body.buyer || !body.transaction) {
      throw new Error("quoteId, buyer, and signed transaction are required.");
    }
    const buyer = new PublicKey(body.buyer);
    if (!PublicKey.isOnCurve(buyer.toBytes())) throw new Error("Connect a valid user-controlled Solana wallet first.");

    const config = createFoundationDirectConfig();
    const store = config.controlStore;
    if (!store) throw new Error("Durable store is unconfigured.");
    const quote = await store.getQuote?.(body.quoteId);
    if (!quote) throw new Error("Quote not found in persistent store.");
    if (quote.buyer !== buyer.toBase58()) throw new Error("This quote is bound to a different buyer.");
    if (quote.status === "SUBMITTED" && quote.txSignature) {
      return NextResponse.json({ signature: quote.txSignature, status: "SUBMITTED" });
    }
    if (quote.status !== "BUILT") throw new Error("This quote is no longer available for submission.");
    if (quote.expiresAt <= Date.now()) {
      await store.transitionQuoteStatus?.(body.quoteId, ["BUILT"], "EXPIRED");
      throw new Error("This quote has expired. Request a new quote.");
    }
    if (
      quote.treasuryRecipient !== config.treasuryRecipient.toBase58() ||
      quote.gtreeMint !== config.gtreeMint.toBase58() ||
      quote.saleTokenAccount !== config.saleTokenAccount.toBase58() ||
      quote.saleSignerPublicKey !== config.saleSigner.publicKey.toBase58()
    ) {
      throw new Error("The prepared Foundation transaction no longer matches the active sale configuration.");
    }

    if (!quote.lastValidBlockHeight) {
      throw new Error("The prepared purchase is missing its blockhash validity window.");
    }
    const connection = createFoundationConnection();
    const currentBlockHeight = await connection.getBlockHeight("confirmed");
    if (currentBlockHeight > quote.lastValidBlockHeight) {
      await store.transitionQuoteStatus?.(body.quoteId, ["BUILT"], "EXPIRED");
      throw new Error("This quote blockhash has expired. Request a new quote.");
    }

    const transaction = decodeAndVerifyBuyerSignedFoundationSubmission(body.transaction, quote);
    addAndVerifyFoundationDelegateSignature(transaction, config.saleSigner);
    const simulation = await connection.simulateTransaction(transaction, {
      sigVerify: false,
      commitment: "confirmed",
    });
    assertFoundationSimulationSucceeded(simulation);

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 2,
      preflightCommitment: "confirmed",
    });
    const transitioned = await store.transitionQuoteStatus?.(body.quoteId, ["BUILT"], "SUBMITTED", {
      tx_signature: signature,
      submitted_at: Date.now(),
    });
    if (!transitioned) throw new Error("Purchase submission state changed before it could be recorded.");
    return NextResponse.json({ signature, status: "SUBMITTED" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Foundation purchase submission failed." },
      { status: 422 },
    );
  }
}
