import { NextResponse } from "next/server";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { createHash } from "node:crypto";
import { resolveRuntimeSetting } from "@/lib/admin/runtime-settings";
import {
  createFoundationConnection,
  createFoundationDirectConfig,
  createFoundationDirectPriceProvider,
  SolanaFoundationPurchaseReader,
  validateFoundationDirectSetup,
} from "@/lib/purchase/foundation-direct-server";
import { createFoundationDirectPurchase } from "@/lib/purchase/foundation-direct";
import { verifyFoundationQuoteToken } from "@/lib/purchase/foundation-quote-token";
import { assertFoundationSimulationSucceeded } from "@/lib/purchase/foundation-submission";

export async function POST(request: Request) {
  try {
    const purchaseMode = resolveRuntimeSetting("purchaseMode");
    if (purchaseMode === "PAUSED") throw new Error("GTREE purchases are currently paused.");
    if (purchaseMode !== "FOUNDATION_DIRECT") {
      throw new Error("Foundation direct-sale transaction creation is disabled while PURCHASE_MODE is MARKET.");
    }

    const body = (await request.json()) as {
      wallet?: string;
      quoteToken?: string;
      expectedOutputTokenUnits?: string;
    };
    if (!body.wallet) throw new Error("Connect a valid Solana wallet first.");
    if (!body.quoteToken) throw new Error("Refresh the Foundation quote before continuing.");

    const buyer = new PublicKey(body.wallet);
    if (!PublicKey.isOnCurve(buyer.toBytes())) throw new Error("Connect a valid user-controlled Solana wallet first.");

    const config = createFoundationDirectConfig();
    const connection = createFoundationConnection();
    await validateFoundationDirectSetup(config, connection);

    const verifiedQuote = verifyFoundationQuoteToken(config, body.quoteToken, buyer);

    const store = config.controlStore;
    if (!store) {
      throw new Error("Durable store is unconfigured.");
    }

    const quoteRecord = await store.getQuote?.(verifiedQuote.quoteId);
    if (!quoteRecord) {
      throw new Error("Quote not found in persistent store.");
    }

    if (quoteRecord.buyer !== buyer.toBase58()) {
      throw new Error("This quote is bound to a different buyer.");
    }

    // If already BUILT, return the exact same byte-identical buyer-first transaction.
    if (quoteRecord.status === "BUILT") {
      if (quoteRecord.expiresAt <= Date.now()) {
        await store.transitionQuoteStatus?.(verifiedQuote.quoteId, ["BUILT"], "EXPIRED");
        throw new Error("This quote has expired.");
      }
      if (quoteRecord.serializedTransaction && hasLegacyDelegateSignature(quoteRecord.serializedTransaction, config.saleSigner.publicKey)) {
        await store.transitionQuoteStatus?.(verifiedQuote.quoteId, ["BUILT"], "EXPIRED");
        throw new Error("This purchase was prepared with a legacy signing order. Request a new quote.");
      }

      return NextResponse.json({
        transaction: quoteRecord.serializedTransaction,
        transactionType: "foundation-direct",
        lastValidBlockHeight: quoteRecord.lastValidBlockHeight,
        orderId: quoteRecord.orderId || verifiedQuote.quoteId,
        inputLamports: quoteRecord.inputLamports.toString(),
        outputAmountRaw: quoteRecord.outputTokenUnits.toString(),
        buyerAta: quoteRecord.buyerPublicKey || buyer.toBase58(),
        treasuryRecipient: quoteRecord.treasuryRecipient || config.treasuryRecipient.toBase58(),
        gtreeMint: quoteRecord.gtreeMint || config.gtreeMint.toBase58(),
        saleTokenAccount: quoteRecord.saleTokenAccount || config.saleTokenAccount.toBase58(),
        transactionSizeBytes: quoteRecord.serializedTransaction ? Buffer.from(quoteRecord.serializedTransaction, "base64").length : 0,
        expectedMainnetFeeLamports: "10000",
      });
    }

    // Only CREATED quotes can be built
    if (quoteRecord.status !== "CREATED") {
      throw new Error("This quote has already been processed, expired, or failed.");
    }

    if (quoteRecord.expiresAt <= Date.now()) {
      await store.transitionQuoteStatus?.(verifiedQuote.quoteId, ["CREATED"], "EXPIRED");
      throw new Error("This quote has expired.");
    }

    // Re-verify that all configured addresses still match
    if (quoteRecord.gtreeMint !== config.gtreeMint.toBase58()) {
      throw new Error("Configured GTREE mint has changed since quote generation.");
    }
    if (quoteRecord.treasuryRecipient !== config.treasuryRecipient.toBase58()) {
      throw new Error("Configured treasury recipient has changed since quote generation.");
    }
    if (quoteRecord.saleTokenAccount !== config.saleTokenAccount.toBase58()) {
      throw new Error("Configured sale token account has changed since quote generation.");
    }
    if (quoteRecord.saleSignerPublicKey !== config.saleSigner.publicKey.toBase58()) {
      throw new Error("Configured sale signer has changed since quote generation.");
    }

    if (
      typeof body.expectedOutputTokenUnits !== "string" ||
      !/^[1-9]\d*$/.test(body.expectedOutputTokenUnits) ||
      BigInt(body.expectedOutputTokenUnits) !== verifiedQuote.outputTokenUnits
    ) {
      throw new Error("Foundation quote output does not match the reviewed purchase.");
    }

    const purchase = await createFoundationDirectPurchase(
      config,
      {
        buyer,
        inputLamports: verifiedQuote.inputLamports,
        expectedOutputTokenBaseUnits: verifiedQuote.outputTokenUnits,
        orderId: verifiedQuote.quoteId,
      },
      createFoundationDirectPriceProvider(),
      new SolanaFoundationPurchaseReader(createFoundationConnection()),
    );

    // Phantom receives a fresh, simulation-validated message with no Foundation
    // signature. It signs first; the protected submit endpoint appends only the
    // delegate signature without altering the message.
    const preSignSimulation = await connection.simulateTransaction(purchase.transaction, {
      sigVerify: false,
      commitment: "confirmed",
    });
    assertFoundationSimulationSucceeded(preSignSimulation);

    // Calculate SHA-256 message hash over exact VersionedMessage bytes
    const msgBytes = purchase.transaction.message.serialize();
    const msgHash = createHash("sha256").update(msgBytes).digest("hex");

    // Atomically transition status CREATED -> BUILT
    const transitioned = await store.transitionQuoteStatus?.(
      verifiedQuote.quoteId,
      ["CREATED"],
      "BUILT",
      {
        serialized_transaction: purchase.serializedTransaction,
        transaction_message_hash: msgHash,
        last_valid_block_height: Number(purchase.lastValidBlockHeight),
      }
    );

    if (!transitioned) {
      throw new Error("This quote token has already been consumed or updated.");
    }

    return NextResponse.json({
      transaction: purchase.serializedTransaction,
      transactionType: "foundation-direct",
      lastValidBlockHeight: Number(purchase.lastValidBlockHeight),
      orderId: purchase.orderId,
      inputLamports: purchase.inputLamports,
      outputAmountRaw: purchase.outputTokenBaseUnits,
      buyerAta: purchase.buyerAta,
      treasuryRecipient: purchase.treasuryRecipient,
      gtreeMint: purchase.gtreeMint,
      saleTokenAccount: purchase.saleTokenAccount,
      transactionSizeBytes: purchase.transactionSizeBytes,
      expectedMainnetFeeLamports: purchase.expectedMainnetFeeLamports,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Foundation purchase preparation failed." },
      { status: 422 },
    );
  }
}

function hasLegacyDelegateSignature(serializedTransaction: string, saleSigner: PublicKey): boolean {
  try {
    const transaction = VersionedTransaction.deserialize(Buffer.from(serializedTransaction, "base64"));
    const delegateIndex = transaction.message.staticAccountKeys
      .slice(0, transaction.message.header.numRequiredSignatures)
      .findIndex((key) => key.equals(saleSigner));
    return delegateIndex >= 0 && !transaction.signatures[delegateIndex].every((byte) => byte === 0);
  } catch {
    // An unreadable stored transaction is not safe to reuse.
    return true;
  }
}
