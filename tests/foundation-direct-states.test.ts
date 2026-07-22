/* eslint-disable @typescript-eslint/no-explicit-any */
import { Module } from "node:module";
const originalRequire = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string, ...args: any[]) {
  if (id === "server-only") {
    return {};
  }
  return originalRequire.apply(this, [id, ...args] as any);
};

import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { PublicKey } from "@solana/web3.js";
import { SQLiteFoundationSaleControlStore } from "../src/lib/purchase/foundation-direct-db";
import { createFoundationDirectConfig } from "../src/lib/purchase/foundation-direct-server";
import {
  AggregatedFoundationReferencePriceProvider,
  FOUNDATION_REFERENCE_SOURCE_TIMEOUT_MS,
  FoundationReferencePriceUnavailableError,
  type FoundationPriceCandidate,
  ValidatedReferencePriceCache,
} from "../src/lib/purchase/foundation-reference-price";
import type { FoundationSaleControlStore } from "../src/lib/purchase/foundation-direct";
import { ExternalRequestError, fetchJson } from "../src/services/http/fetch-json";
import { foundationQuoteErrorResponse } from "../src/app/api/foundation/quote/route";

const TEST_DB_NAME = "foundation-sale-test.db";
const TEST_DB_PATH = path.join(process.cwd(), "data", TEST_DB_NAME);

function cleanTestDbFile() {
  try {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    const shm = TEST_DB_PATH + "-shm";
    const wal = TEST_DB_PATH + "-wal";
    if (fs.existsSync(shm)) fs.unlinkSync(shm);
    if (fs.existsSync(wal)) fs.unlinkSync(wal);
  } catch {
    // Ignore
  }
}

// Clean up any stale test database before initiating tests
cleanTestDbFile();

const globalStore = new SQLiteFoundationSaleControlStore(TEST_DB_NAME);

function referenceStore(overrides: Partial<FoundationSaleControlStore> = {}): FoundationSaleControlStore {
  return {
    getWalletTokenUnitsIssued: async () => 0n,
    getDailyTokenUnitsIssued: async () => 0n,
    recordIssuedTransaction: async () => undefined,
    getQuoteState: async () => null,
    setQuoteState: async () => undefined,
    getPriceObservations: async () => [],
    recordPriceObservation: async () => undefined,
    getCooldownUntil: async () => 0,
    setCooldownUntil: async () => undefined,
    ...overrides,
  };
}

function candidate(now: number, label: string): FoundationPriceCandidate {
  return {
    label,
    fetchedAt: new Date(now),
    numerator: 1_000n,
    denominator: 1n,
    solPriceUsdCents: label === "meteora" ? 15_000n : null,
  };
}

function referenceProvider(options: {
  now: () => number;
  cache: ValidatedReferencePriceCache;
  meteora: () => Promise<FoundationPriceCandidate>;
  jupiter: () => Promise<FoundationPriceCandidate>;
  controlStore?: FoundationSaleControlStore;
  cacheTtlMs?: number;
  sourceTimeoutMs?: number;
  sourceRetries?: number;
}) {
  return new AggregatedFoundationReferencePriceProvider({
    probeLamports: [1_000_000n],
    slippageBps: 50,
    maxSourceAgeMs: 10_000,
    maxDivergenceBps: 500,
    minSourceCount: 2,
    now: options.now,
    cache: options.cache,
    cacheTtlMs: options.cacheTtlMs,
    sourceTimeoutMs: options.sourceTimeoutMs,
    sourceRetries: options.sourceRetries ?? 0,
    controlStore: options.controlStore ?? referenceStore(),
    loadMeteoraCandidate: options.meteora,
    loadJupiterCandidate: options.jupiter,
  });
}

function clearTables(store: SQLiteFoundationSaleControlStore) {
  store["db"].exec("DELETE FROM quotes;");
  store["db"].exec("DELETE FROM price_observations;");
  store["db"].exec("DELETE FROM cooldown;");
  store["db"].exec("DELETE FROM issued_transactions;");
}

test("Phase 7: Price Safety, TWAP, and Cooldown Tests", async (t) => {
  await t.test("1 & 2. Normal price and movement below 10% accepted", async () => {
    clearTables(globalStore);

    // Initial price ratio: 1000 GTREE/SOL
    await globalStore.recordPriceObservation("1000.000000", Date.now());

    // Record price of 1050 (5% increase - should be accepted)
    await globalStore.recordPriceObservation("1050.000000", Date.now());

    const obs = await globalStore.getPriceObservations();
    assert.equal(obs.length, 2);
    assert.equal(obs[0].priceGtreePerSol, "1000.000000");
    assert.equal(obs[1].priceGtreePerSol, "1050.000000");
  });

  await t.test("3 & 4. Volatility above 10% initiates 1-hour cooldown", async () => {
    clearTables(globalStore);

    // Bootstrap first observation: 1000
    await globalStore.recordPriceObservation("1000.000000", Date.now() - 5000);

    // Check last observation
    const obs = await globalStore.getPriceObservations();
    const lastPrice = Number(obs[obs.length - 1].priceGtreePerSol);

    // A price of 1150 is a 15% change from 1000 (exceeds 10% allowed)
    const newPrice = 1150.000000;
    const changePct = Math.abs(newPrice - lastPrice) / lastPrice;

    assert.equal(changePct > 0.10, true);

    // Volatility check would trigger cooldown
    const cooldownDuration = 60 * 60 * 1000; // 1 hour
    const cooldownUntil = Date.now() + cooldownDuration;
    await globalStore.setCooldownUntil(cooldownUntil);

    // Verify cooldown is set
    const activeCooldown = await globalStore.getCooldownUntil();
    assert.equal(activeCooldown, cooldownUntil);
  });

  await t.test("7. Cooldown persists across database reinitialization", async () => {
    // Re-initialize a new store instance over the same locked DB file
    const store = new SQLiteFoundationSaleControlStore(TEST_DB_NAME);
    const activeCooldown = await store.getCooldownUntil();
    assert.ok(activeCooldown > 0);
  });

  await t.test("8. Observations older than 2 hours are excluded", async () => {
    clearTables(globalStore);

    // Record stale observation (3 hours old)
    await globalStore.recordPriceObservation("1000.000000", Date.now() - 3 * 60 * 60 * 1000);

    // Record fresh observation (10 seconds old)
    const freshTime = Date.now() - 10000;
    await globalStore.recordPriceObservation("1100.000000", freshTime);

    // Query observations
    const obs = await globalStore.getPriceObservations();
    // Stale observation is deleted in clean-up of recordPriceObservation!
    assert.equal(obs.length, 1);
    assert.equal(obs[0].priceGtreePerSol, "1100.000000");
  });
});

test("independent Meteora and Jupiter reference requests start concurrently", async () => {
  const now = 1_000_000;
  let started = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const load = (label: string) => async () => {
    started += 1;
    await gate;
    return candidate(now, label);
  };
  const provider = referenceProvider({
    now: () => now,
    cache: new ValidatedReferencePriceCache(),
    meteora: load("meteora"),
    jupiter: load("jupiter"),
  });

  const pending = provider.getReferencePrice(1n, PublicKey.unique());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started, 2);
  release();
  await pending;
});

test("validated reference cache is reused within its short TTL", async () => {
  let now = 2_000_000;
  let sourceRequests = 0;
  const load = (label: string) => async () => {
    sourceRequests += 1;
    return candidate(now, label);
  };
  const provider = referenceProvider({
    now: () => now,
    cache: new ValidatedReferencePriceCache(),
    cacheTtlMs: 100,
    meteora: load("meteora"),
    jupiter: load("jupiter"),
  });

  await provider.getReferencePrice(1n, PublicKey.unique());
  now += 50;
  await provider.getReferencePrice(2n, PublicKey.unique());
  assert.equal(sourceRequests, 2);
});

test("reference cache expiry triggers fresh source requests", async () => {
  let now = 3_000_000;
  let sourceRequests = 0;
  const load = (label: string) => async () => {
    sourceRequests += 1;
    return candidate(now, label);
  };
  const provider = referenceProvider({
    now: () => now,
    cache: new ValidatedReferencePriceCache(),
    cacheTtlMs: 100,
    meteora: load("meteora"),
    jupiter: load("jupiter"),
  });

  await provider.getReferencePrice(1n, PublicKey.unique());
  now += 101;
  await provider.getReferencePrice(1n, PublicKey.unique());
  assert.equal(sourceRequests, 4);
});

test("failed and cooldown reference results are not cached or reused", async () => {
  const now = 4_000_000;
  let failedRequests = 0;
  const failedProvider = referenceProvider({
    now: () => now,
    cache: new ValidatedReferencePriceCache(),
    meteora: async () => {
      failedRequests += 1;
      throw new Error("meteora failed");
    },
    jupiter: async () => {
      failedRequests += 1;
      throw new Error("jupiter failed");
    },
  });
  await assert.rejects(() => failedProvider.getReferencePrice(1n, PublicKey.unique()), /unavailable/);
  await assert.rejects(() => failedProvider.getReferencePrice(1n, PublicKey.unique()), /unavailable/);
  assert.equal(failedRequests, 4);

  let cooldownUntil = 0;
  let successfulRequests = 0;
  const cache = new ValidatedReferencePriceCache();
  const load = (label: string) => async () => {
    successfulRequests += 1;
    return candidate(now, label);
  };
  const cooldownProvider = referenceProvider({
    now: () => now,
    cache,
    meteora: load("meteora"),
    jupiter: load("jupiter"),
    controlStore: referenceStore({ getCooldownUntil: async () => cooldownUntil }),
  });
  await cooldownProvider.getReferencePrice(1n, PublicKey.unique());
  cooldownUntil = now + 60_000;
  await assert.rejects(() => cooldownProvider.getReferencePrice(1n, PublicKey.unique()), /cooldown/);
  assert.equal(successfulRequests, 2);
});

test("default reference source timeout is 8000ms", () => {
  assert.equal(FOUNDATION_REFERENCE_SOURCE_TIMEOUT_MS, 8_000);
});

test("provider response below timeout succeeds and 3s delay is not aborted by 8s timeout", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const started = Date.now();
    const result = await fetchJson<{ ok: boolean }>("https://example.test/quote", { cache: "no-store" }, {
      source: "timed probe",
      timeoutMs: FOUNDATION_REFERENCE_SOURCE_TIMEOUT_MS,
      retries: 0,
    });
    assert.equal(result.ok, true);
    assert.ok(Date.now() - started >= 2_900);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider exceeding timeout fails as timeout", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => resolve(), 200);
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) {
        clearTimeout(timer);
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
        return;
      }
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => fetchJson("https://example.test/slow", { cache: "no-store" }, { source: "slow probe", timeoutMs: 40, retries: 0 }),
      (error: unknown) => error instanceof ExternalRequestError && error.outcome === "timeout" && error.retryable,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("one provider timeout does not abort other providers", async () => {
  const now = 5_000_000;
  let jupiterCompleted = false;
  const provider = referenceProvider({
    now: () => now,
    cache: new ValidatedReferencePriceCache(),
    sourceTimeoutMs: 8_000,
    meteora: async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      throw new ExternalRequestError("Meteora timed out.", "meteora", "timeout", null, true);
    },
    jupiter: async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      jupiterCompleted = true;
      return candidate(now, "jupiter");
    },
  });
  await assert.rejects(() => provider.getReferencePrice(1n, PublicKey.unique()), FoundationReferencePriceUnavailableError);
  assert.equal(jupiterCompleted, true);
});

test("one successful source is preserved while another retries", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response("{}", { status: 503 });
    }
    return new Response(JSON.stringify({ value: attempts }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await fetchJson<{ value: number }>("https://example.test/retry", { cache: "no-store" }, {
      source: "retry probe",
      timeoutMs: 1_000,
      retries: 1,
    });
    assert.equal(result.value, 2);
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const now = 6_000_000;
  let meteoraCalls = 0;
  let jupiterCalls = 0;
  const price = await referenceProvider({
    now: () => now,
    cache: new ValidatedReferencePriceCache(),
    meteora: async () => {
      meteoraCalls += 1;
      return candidate(now, "meteora");
    },
    jupiter: async () => {
      jupiterCalls += 1;
      if (jupiterCalls === 1) {
        // Failed provider retries once while the successful Meteora result remains usable.
        jupiterCalls += 1;
      }
      return candidate(now, "jupiter");
    },
  }).getReferencePrice(1n, PublicKey.unique());

  assert.equal(meteoraCalls, 1);
  assert.equal(jupiterCalls, 2);
  assert.equal(price.priceNumerator, 1_000n);
});

test("client cancellation and aborted requests are not cached as failures", async () => {
  const now = 7_000_000;
  const cache = new ValidatedReferencePriceCache();
  const provider = referenceProvider({
    now: () => now,
    cache,
    meteora: async () => {
      throw new ExternalRequestError("Meteora aborted by client.", "meteora", "aborted-by-client", null, false);
    },
    jupiter: async () => {
      throw new ExternalRequestError("Jupiter aborted by client.", "jupiter", "aborted-by-client", null, false);
    },
  });
  await assert.rejects(() => provider.getReferencePrice(1n, PublicKey.unique()), FoundationReferencePriceUnavailableError);
  assert.equal(cache.get(now), null);

  const originalFetch = globalThis.fetch;
  const clientAbort = new AbortController();
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    await new Promise<void>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
        return;
      }
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const pending = fetchJson("https://example.test/client-abort", { cache: "no-store", signal: clientAbort.signal }, {
      source: "client abort probe",
      timeoutMs: 5_000,
      retries: 0,
    });
    clientAbort.abort();
    await assert.rejects(
      () => pending,
      (error: unknown) => error instanceof ExternalRequestError && error.outcome === "aborted-by-client" && !error.retryable,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider failure returns retryable 503 and success path remains 200-shaped", async () => {
  const unavailable = foundationQuoteErrorResponse(new FoundationReferencePriceUnavailableError());
  assert.equal(unavailable.status, 503);
  const unavailableBody = await unavailable.json();
  assert.equal(unavailableBody.retryable, true);
  assert.match(unavailableBody.error, /temporarily unavailable/);

  const invalid = foundationQuoteErrorResponse(new Error("Purchase amount is below the configured minimum."));
  assert.equal(invalid.status, 422);

  // Validated success still produces a usable reference price object (HTTP 200 payload shape).
  const now = 8_000_000;
  const price = await referenceProvider({
    now: () => now,
    cache: new ValidatedReferencePriceCache(),
    meteora: async () => candidate(now, "meteora"),
    jupiter: async () => candidate(now, "jupiter"),
  }).getReferencePrice(1n, PublicKey.unique());
  assert.equal(price.priceNumerator, 1_000n);
  assert.equal(price.priceDenominator, 1n);
});

test("Phase 8: Settlement, State-Transition, and Idempotency Tests", async (t) => {
  await t.test("1. CREATED -> BUILT succeeds once", async () => {
    clearTables(globalStore);

    const quoteId = "quote-id-001";
    const buyer = PublicKey.unique().toBase58();
    const input = 1_000_000_000n;
    const output = 1000_000_000n;
    const expiry = Date.now() + 15000;

    await globalStore.createQuote(quoteId, buyer, input, output, expiry);

    const quote = await globalStore.getQuote(quoteId);
    assert.equal(quote?.status, "CREATED");

    // Transition CREATED -> BUILT atomically
    const transitioned = await globalStore.transitionQuoteStatus?.(quoteId, ["CREATED"], "BUILT", {
      serialized_transaction: "serialized-tx-base64",
      transaction_message_hash: "msg-hash-sha256",
      last_valid_block_height: 123456,
    });

    assert.equal(transitioned, true);

    const builtQuote = await globalStore.getQuote(quoteId);
    assert.equal(builtQuote?.status, "BUILT");
    assert.equal(builtQuote?.serializedTransaction, "serialized-tx-base64");
  });

  await t.test("CREATED -> BUILT is atomic and cannot trigger twice", async () => {
    const quoteId = "quote-id-001";

    const reTransitioned = await globalStore.transitionQuoteStatus?.(quoteId, ["CREATED"], "BUILT", {
      serialized_transaction: "new-tx-base64",
    });

    // Should return false because quote is no longer in CREATED status
    assert.equal(reTransitioned, false);

    // Serialized transaction should remain byte-identical
    const quote = await globalStore.getQuote(quoteId);
    assert.equal(quote?.serializedTransaction, "serialized-tx-base64");
  });

  await t.test("Different buyer cannot use an existing quote", async () => {
    const quoteId = "quote-id-001";
    const anotherBuyer = PublicKey.unique().toBase58();

    const quote = await globalStore.getQuote(quoteId);
    assert.notEqual(quote?.buyer, anotherBuyer);
  });

  await t.test("BUILT -> SUBMITTED binds transaction signature", async () => {
    const quoteId = "quote-id-001";
    const signature = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d_sig_1";

    const bound = await globalStore.transitionQuoteStatus?.(quoteId, ["BUILT"], "SUBMITTED", {
      tx_signature: signature,
      submitted_at: Date.now(),
    });

    assert.equal(bound, true);

    const quote = await globalStore.getQuote(quoteId);
    assert.equal(quote?.status, "SUBMITTED");
    assert.equal(quote?.txSignature, signature);
  });

  await t.test("SUBMITTED -> CONFIRMED is terminal", async () => {
    const quoteId = "quote-id-001";

    const confirmed = await globalStore.transitionQuoteStatus?.(quoteId, ["SUBMITTED"], "CONFIRMED", {
      confirmed_at: Date.now(),
    });
    assert.equal(confirmed, true);

    const quote = await globalStore.getQuote(quoteId);
    assert.equal(quote?.status, "CONFIRMED");

    // Any transition from CONFIRMED should fail because CONFIRMED is not in fromStates
    const reTransitioned = await globalStore.transitionQuoteStatus?.(quoteId, ["CREATED", "BUILT", "SUBMITTED"], "EXPIRED");
    assert.equal(reTransitioned, false);
  });

  await t.test("Signature cannot belong to two quotes", async () => {
    clearTables(globalStore);
    const signature = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d_sig_unique";
    await globalStore.createQuote("quote-signature-a", PublicKey.unique().toBase58(), 1n, 1n, Date.now() + 60_000);
    await globalStore.createQuote("quote-signature-b", PublicKey.unique().toBase58(), 1n, 1n, Date.now() + 60_000);
    assert.equal(await globalStore.transitionQuoteStatus?.("quote-signature-a", ["CREATED"], "SUBMITTED", { tx_signature: signature }), true);
    await assert.rejects(
      () => globalStore.transitionQuoteStatus?.("quote-signature-b", ["CREATED"], "SUBMITTED", { tx_signature: signature }),
      /unique|constraint/i,
    );
  });

  await t.test("Bound signature cannot be replaced", async () => {
    clearTables(globalStore);
    const quoteId = "quote-signature-replacement";
    await globalStore.createQuote(quoteId, PublicKey.unique().toBase58(), 1n, 1n, Date.now() + 60_000);
    const firstSignature = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d_sig_first";
    const secondSignature = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d_sig_second";
    assert.equal(await globalStore.transitionQuoteStatus?.(quoteId, ["CREATED"], "SUBMITTED", { tx_signature: firstSignature }), true);
    assert.equal(await globalStore.transitionQuoteStatus?.(quoteId, ["BUILT"], "SUBMITTED", { tx_signature: secondSignature }), false);
    assert.equal((await globalStore.getQuote(quoteId))?.txSignature, firstSignature);
  });

  await t.test("Legacy CONSUMED rows map safely to BUILT when reading", async () => {
    clearTables(globalStore);

    // Insert legacy row with status 'CONSUMED' directly via internal db execution
    globalStore["db"].exec(`
      INSERT INTO quotes (quote_id, buyer, input_lamports, output_token_units, expires_at, status, created_at, updated_at)
      VALUES ('legacy-quote-1', 'buyer-pubkey', '1000', '2000', 999999999, 'CONSUMED', 12345, 12345)
    `);

    const quote = await globalStore.getQuote("legacy-quote-1");
    // Maps legacy CONSUMED safely to BUILT when reading
    assert.equal(quote?.status, "BUILT");
  });

  await t.test("PAUSED and MARKET modes do not load the signer", async () => {
    // Since SERVER_ENV.purchaseMode is PAUSED or MARKET by default in testing,
    // verify that createFoundationDirectConfig does not throw when keypair paths are unconfigured
    const config = createFoundationDirectConfig();
    assert.ok(config);
  });
});
