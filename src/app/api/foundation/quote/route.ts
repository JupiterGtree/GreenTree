import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { resolveRuntimeSetting } from "@/lib/admin/runtime-settings";
import { decimalToAtomic, atomicToDecimal } from "@/lib/market/amounts";
import {
  createFoundationConnection,
  createFoundationDirectConfig,
  createFoundationDirectPriceProvider,
  SolanaFoundationPurchaseReader,
  validateFoundationDirectSetup,
} from "@/lib/purchase/foundation-direct-server";
import { createFoundationDirectQuote } from "@/lib/purchase/foundation-direct";
import { createFoundationQuoteToken } from "@/lib/purchase/foundation-quote-token";
import { FoundationReferencePriceUnavailableError } from "@/lib/purchase/foundation-reference-price";

export async function GET(request: Request) {
  const routeStartedAt = performance.now();
  let quoteMs = 0;
  let databaseWriteMs = 0;
  const { searchParams } = new URL(request.url);
  const inputSol = searchParams.get("inputSol") ?? "";
  const wallet = searchParams.get("wallet");

  try {
    const purchaseMode = resolveRuntimeSetting("purchaseMode");
    if (purchaseMode === "PAUSED") throw new Error("GTREE purchases are currently paused.");
    if (purchaseMode !== "FOUNDATION_DIRECT") {
      throw new Error("Foundation direct-sale quotes are disabled while PURCHASE_MODE is MARKET.");
    }
    if (!wallet) throw new Error("Connect a wallet before requesting a Foundation quote.");
    const buyer = new PublicKey(wallet);
    if (!PublicKey.isOnCurve(buyer.toBytes())) throw new Error("Connect a valid user-controlled Solana wallet first.");

    const inputAmount = decimalToAtomic(inputSol, 9);
    const config = createFoundationDirectConfig();
    const connection = createFoundationConnection();
    await validateFoundationDirectSetup(config, connection);

    const quoteStartedAt = performance.now();
    const quote = await createFoundationDirectQuote(
      config,
      {
        inputSol: inputAmount.normalized,
        inputLamports: BigInt(inputAmount.raw),
        buyer,
      },
      createFoundationDirectPriceProvider(),
      new SolanaFoundationPurchaseReader(createFoundationConnection()),
    );
    quoteMs = performance.now() - quoteStartedAt;

    // Persist the quote in SQLite database with state 'CREATED'
    if (config.controlStore && config.controlStore.createQuote) {
      const databaseStartedAt = performance.now();
      await config.controlStore.createQuote(
        quote.quoteId,
        buyer.toBase58(),
        BigInt(quote.inputAmountRaw),
        BigInt(quote.outputAmountRaw),
        quote.expiresAt,
        {
          orderId: quote.quoteId,
          buyerPublicKey: buyer.toBase58(),
          treasuryRecipient: config.treasuryRecipient.toBase58(),
          gtreeMint: config.gtreeMint.toBase58(),
          saleTokenAccount: config.saleTokenAccount.toBase58(),
          saleSignerPublicKey: config.saleSigner.publicKey.toBase58(),
          quoteCreatedAt: Date.now(),
          quoteExpiresAt: quote.expiresAt,
          quoteSolPriceUsd: quote.solPriceUsd,
          quoteInputUsd: quote.inputUsd,
        }
      );
      databaseWriteMs = performance.now() - databaseStartedAt;
    }

    return NextResponse.json({
      ...quote,
      quoteToken: createFoundationQuoteToken(config, quote, buyer),
    });
  } catch (error) {
    return foundationQuoteErrorResponse(error);
  } finally {
    logRouteTiming(routeStartedAt, quoteMs, databaseWriteMs);
  }
}

export async function POST(request: Request) {
  const routeStartedAt = performance.now();
  let quoteMs = 0;
  let databaseWriteMs = 0;
  try {
    const purchaseMode = resolveRuntimeSetting("purchaseMode");
    if (purchaseMode === "PAUSED") throw new Error("GTREE purchases are currently paused.");
    if (purchaseMode !== "FOUNDATION_DIRECT") {
      throw new Error("Foundation direct-sale quotes are disabled while PURCHASE_MODE is MARKET.");
    }

    const body = (await request.json()) as {
      buyerPublicKey?: string;
      inputLamports?: string;
    };

    if (!body.buyerPublicKey) throw new Error("buyerPublicKey is required.");
    if (!body.inputLamports || !/^[1-9]\d*$/.test(body.inputLamports)) {
      throw new Error("inputLamports must be a positive integer string.");
    }

    const buyer = new PublicKey(body.buyerPublicKey);
    if (!PublicKey.isOnCurve(buyer.toBytes())) throw new Error("Connect a valid user-controlled Solana wallet first.");

    const lamports = BigInt(body.inputLamports);
    const inputSolStr = atomicToDecimal(lamports, 9);

    const config = createFoundationDirectConfig();
    const connection = createFoundationConnection();
    await validateFoundationDirectSetup(config, connection);

    const quoteStartedAt = performance.now();
    const quote = await createFoundationDirectQuote(
      config,
      {
        inputSol: inputSolStr,
        inputLamports: lamports,
        buyer,
      },
      createFoundationDirectPriceProvider(),
      new SolanaFoundationPurchaseReader(createFoundationConnection()),
    );
    quoteMs = performance.now() - quoteStartedAt;

    // Persist the quote in SQLite database with state 'CREATED'
    if (config.controlStore && config.controlStore.createQuote) {
      const databaseStartedAt = performance.now();
      await config.controlStore.createQuote(
        quote.quoteId,
        buyer.toBase58(),
        BigInt(quote.inputAmountRaw),
        BigInt(quote.outputAmountRaw),
        quote.expiresAt,
        {
          orderId: quote.quoteId,
          buyerPublicKey: buyer.toBase58(),
          treasuryRecipient: config.treasuryRecipient.toBase58(),
          gtreeMint: config.gtreeMint.toBase58(),
          saleTokenAccount: config.saleTokenAccount.toBase58(),
          saleSignerPublicKey: config.saleSigner.publicKey.toBase58(),
          quoteCreatedAt: Date.now(),
          quoteExpiresAt: quote.expiresAt,
          quoteSolPriceUsd: quote.solPriceUsd,
          quoteInputUsd: quote.inputUsd,
        }
      );
      databaseWriteMs = performance.now() - databaseStartedAt;
    }

    return NextResponse.json({
      quoteId: quote.quoteId,
      inputLamports: quote.inputLamports,
      outputGtreeBaseUnits: quote.outputAmountRaw,
      expiry: quote.expiresAt,
      mode: quote.mode,
      inputSol: quote.inputSol,
      outputGtree: quote.outputGtree,
      solPriceUsd: quote.solPriceUsd,
      gtreePriceUsd: quote.gtreePriceUsd,
      inputUsd: quote.inputUsd,
      outputUsd: quote.outputUsd,
      gtreePerSol: quote.gtreePerSol,
      treasuryRecipient: quote.treasuryRecipient,
      quoteToken: createFoundationQuoteToken(config, quote, buyer),
    });
  } catch (error) {
    return foundationQuoteErrorResponse(error);
  } finally {
    logRouteTiming(routeStartedAt, quoteMs, databaseWriteMs);
  }
}

export function foundationQuoteErrorResponse(error: unknown) {
  if (error instanceof FoundationReferencePriceUnavailableError || isRetryableReferenceError(error)) {
    return NextResponse.json(
      {
        error: "Foundation reference price is temporarily unavailable.",
        retryable: true,
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Foundation quote unavailable." },
    { status: 422 },
  );
}

function isRetryableReferenceError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /reference price|timed out|temporarily unavailable|cooldown|diverged/i.test(error.message);
}

function logRouteTiming(startedAt: number, quoteMs: number, databaseWriteMs: number) {
  if (process.env.NODE_ENV !== "development") return;
  const completeRouteMs = performance.now() - startedAt;
  console.info(JSON.stringify({
    event: "foundation_quote_route_timing",
    quoteMs: roundedMs(quoteMs),
    databaseWriteMs: roundedMs(databaseWriteMs),
    completeRouteMs: roundedMs(completeRouteMs),
    bottleneck: quoteMs >= databaseWriteMs ? "quote" : "database-write",
  }));
}

function roundedMs(value: number) {
  return Math.round(value * 10) / 10;
}
