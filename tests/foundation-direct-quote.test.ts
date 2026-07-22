import test from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  createFoundationDirectQuote,
  type FoundationDirectConfig,
  type MintSnapshot,
  type PurchaseChainReader,
  type ReferencePrice,
  type ReferencePriceProvider,
  type TokenAccountSnapshot,
} from "../src/lib/purchase/foundation-direct";
import {
  FOUNDATION_QUOTE_DEBOUNCE_MS,
  getFoundationQuoteBlockReason,
  LatestQuoteRequest,
  provisionalOutputRaw,
} from "../src/lib/purchase/foundation-quote-client";

const ONE_SOL = 1_000_000_000n;

test("foundation direct quote calculates correct output GTREE and consistent USD values", async () => {
  const mint = PublicKey.unique();
  const saleTokenAccount = PublicKey.unique();
  const saleSigner = Keypair.generate();
  const buyer = PublicKey.unique();
  const config: FoundationDirectConfig = {
    purchaseMode: "FOUNDATION_DIRECT",
    treasuryRecipient: PublicKey.unique(),
    gtreeMint: mint,
    saleTokenAccount,
    saleSigner,
    tokenDecimals: 9,
    minPurchaseLamports: 1n,
    maxPurchaseLamports: 100n * ONE_SOL,
    maxOutputTokenUnitsPerTx: null,
    maxPurchaseUsdCents: null,
    maxWalletTokenUnitsPerPeriod: null,
    walletRollingPeriodSeconds: 86_400,
    maxDailyTokenUnits: null,
    minRemainingInventoryTokenUnits: 0n,
    quoteExpirySeconds: 15,
    priceAdjustmentBps: 0,
    emergencyPaused: false,
  };

  class SimpleMockChainReader implements PurchaseChainReader {
    async getLatestBlockhash() {
      return { blockhash: "mock", lastValidBlockHeight: 123n };
    }
    async getTokenAccount(address: PublicKey): Promise<TokenAccountSnapshot> {
      return {
        address,
        mint,
        owner: saleSigner.publicKey,
        amount: 10000n * ONE_SOL,
        delegate: null,
        delegatedAmount: 0n,
        isFrozen: false,
      };
    }
    async getMint(address: PublicKey): Promise<MintSnapshot> {
      return { address, decimals: 9 };
    }
  }

  const mockPriceProvider: ReferencePriceProvider = {
    async getReferencePrice(): Promise<ReferencePrice> {
      return {
        source: "mock reference price provider",
        fetchedAt: new Date(),
        priceNumerator: 1000n, // 1000 base units of GTREE per lamport
        priceDenominator: 1n,
        solPriceUsdCents: 150_00n, // $150 per SOL
        gtreePriceUsdMicros: 150_000n, // $0.15 per GTREE
      };
    },
  };

  const quote = await createFoundationDirectQuote(
    config,
    {
      inputSol: "1.5",
      inputLamports: 1_500_000_000n,
      buyer,
    },
    mockPriceProvider,
    new SimpleMockChainReader(),
  );

  assert.equal(quote.mode, "FOUNDATION_DIRECT");
  assert.equal(quote.inputSol, "1.5");
  assert.equal(quote.outputGtree, "1500"); // 1.5 * 1000 = 1500 GTREE
  assert.equal(quote.gtreePerSol, "1000");
  assert.equal(quote.treasuryRecipient, config.treasuryRecipient.toBase58());

  // Verify consistent USD prices
  assert.equal(quote.solPriceUsd, 150);
  assert.equal(quote.gtreePriceUsd, 0.15);

  // Verify inputUsd and outputUsd are correctly calculated and consistent
  assert.equal(quote.inputUsd, 1.5 * 150); // $225
  assert.equal(quote.outputUsd, 1500 * 0.15); // $225
});

const directPolicy = {
  purchaseMode: "FOUNDATION_DIRECT" as const,
  emergencyPaused: false,
  minPurchaseLamports: "1",
  maxPurchaseLamports: "500000000000",
  automaticQuoteRefreshIntervalMs: 7_500,
};

function handlers<T>(values: T[], errors: unknown[] = []) {
  return {
    success: (value: T) => values.push(value),
    error: (error: unknown) => errors.push(error),
    settled: () => undefined,
  };
}

test("client quote gate sends no request above spendable balance", () => {
  let requests = 0;
  const reason = getFoundationQuoteBlockReason({
    connected: true,
    balanceReady: true,
    inputRaw: "2000000000",
    spendableRaw: 10_800_000n,
    policy: directPolicy,
    transactionState: "IDLE",
  });
  if (reason === null) requests += 1;
  assert.equal(reason, "insufficient");
  assert.equal(requests, 0);
});

test("client quote gate rejects zero and invalid amounts without requests", () => {
  for (const inputRaw of ["0", null]) {
    let requests = 0;
    const reason = getFoundationQuoteBlockReason({
      connected: true,
      balanceReady: true,
      inputRaw,
      spendableRaw: 1_000_000_000n,
      policy: directPolicy,
      transactionState: "IDLE",
    });
    if (reason === null) requests += 1;
    assert.equal(reason, "amount");
    assert.equal(requests, 0);
  }
});

test("rapid typing schedules only the final quote request", async () => {
  assert.equal(FOUNDATION_QUOTE_DEBOUNCE_MS, 400);
  const requester = new LatestQuoteRequest<string>();
  const values: string[] = [];
  let requests = 0;
  for (const amount of ["2", "0.2", "0.02", "0.002"]) {
    requester.schedule(10, async () => {
      requests += 1;
      return amount;
    }, handlers(values));
  }
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(requests, 1);
  assert.deepEqual(values, ["0.002"]);
});

test("an earlier slow response cannot overwrite a newer quote", async () => {
  const requester = new LatestQuoteRequest<string>();
  const values: string[] = [];
  let resolveOld!: (value: string) => void;
  const oldRequest = new Promise<string>((resolve) => { resolveOld = resolve; });
  requester.start(() => oldRequest, handlers(values));
  requester.start(async () => "new", handlers(values));
  resolveOld("old");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(values, ["new"]);
});

test("becoming invalid aborts an in-flight quote", async () => {
  const requester = new LatestQuoteRequest<string>();
  let aborted = false;
  requester.start((requestSignal) => {
    requestSignal.addEventListener("abort", () => { aborted = true; });
    return new Promise<string>(() => undefined);
  }, handlers([]));
  requester.cancel();
  assert.equal(aborted, true);
});

test("previous estimate remains available while a replacement request runs", () => {
  assert.equal(provisionalOutputRaw("2000000", "1000000", "1000000000"), "2000000000");
});

test("automatic quote refresh does not overlap an active request", () => {
  const requester = new LatestQuoteRequest<string>();
  let requests = 0;
  requester.start(() => {
    requests += 1;
    return new Promise<string>(() => undefined);
  }, handlers([]));
  const started = requester.startIfIdle(async () => {
    requests += 1;
    return "new";
  }, handlers([]));
  assert.equal(started, false);
  assert.equal(requests, 1);
  requester.cancel();
});

test("review and signing states block automatic quote refresh", () => {
  for (const transactionState of ["REVIEW", "AWAITING_WALLET", "SUBMITTED", "CONFIRMING", "CONFIRMED"] as const) {
    assert.equal(getFoundationQuoteBlockReason({
      connected: true,
      balanceReady: true,
      inputRaw: "1000000",
      spendableRaw: 1_000_000_000n,
      policy: directPolicy,
      transactionState,
    }), "transaction");
  }
});
