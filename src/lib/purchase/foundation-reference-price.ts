import "server-only";

import { PublicKey } from "@solana/web3.js";
import { SERVER_ENV } from "@/config/server-env";
import { ENV, GTREE_POOL_ADDRESS, WRAPPED_SOL_MINT } from "@/lib/constants/env";
import type { ReferencePrice, ReferencePriceProvider, FoundationSaleControlStore } from "@/lib/purchase/foundation-direct";
import { fetchMeteoraPool } from "@/services/meteora/pool";
import { ExternalRequestError, fetchJson } from "@/services/http/fetch-json";

const TOKEN_DECIMALS = 9;
const TOKEN_SCALE = 10n ** BigInt(TOKEN_DECIMALS);
const LAMPORTS_PER_SOL = 1_000_000_000n;
export const FOUNDATION_REFERENCE_SOURCE_TIMEOUT_MS = 8_000;
export const FOUNDATION_REFERENCE_CACHE_TTL_MS = 7_500;

interface JupiterProbeQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      inputMint: string;
      outputMint: string;
    };
  }>;
}

export interface FoundationPriceCandidate {
  label: string;
  fetchedAt: Date;
  numerator: bigint;
  denominator: bigint;
  solPriceUsdCents: bigint | null;
}

export class FoundationReferencePriceUnavailableError extends Error {
  readonly retryable = true;

  constructor(message = "Foundation reference price is temporarily unavailable.") {
    super(message);
    this.name = "FoundationReferencePriceUnavailableError";
  }
}

export interface AggregatedReferencePriceOptions {
  probeLamports: bigint[];
  slippageBps: number;
  maxSourceAgeMs: number;
  maxDivergenceBps: number;
  minSourceCount: number;
  sourceTimeoutMs?: number;
  sourceRetries?: number;
  controlStore?: FoundationSaleControlStore;
  cache?: ValidatedReferencePriceCache;
  cacheTtlMs?: number;
  now?: () => number;
  loadMeteoraCandidate?: () => Promise<FoundationPriceCandidate>;
  loadJupiterCandidate?: (inputLamports: bigint) => Promise<FoundationPriceCandidate>;
}

interface CachedReferencePrice {
  price: ReferencePrice;
  expiresAt: number;
  cachedAt: number;
}

type SourceOutcome = "success" | "timeout" | "aborted-by-client" | "invalid" | "HTTP error" | "network";

export class ValidatedReferencePriceCache {
  private value: CachedReferencePrice | null = null;

  get(now: number): ReferencePrice | null {
    if (!this.value || this.value.expiresAt <= now) {
      this.value = null;
      return null;
    }
    return this.value.price;
  }

  set(price: ReferencePrice, expiresAt: number, cachedAt = Date.now()) {
    this.value = { price, expiresAt, cachedAt };
  }

  clear() {
    this.value = null;
  }

  status(now: number): { state: "active"; ageMs: number; remainingMs: number } | { state: "empty" } {
    if (!this.value || this.value.expiresAt <= now) return { state: "empty" };
    return {
      state: "active",
      ageMs: Math.max(0, now - this.value.cachedAt),
      remainingMs: Math.max(0, this.value.expiresAt - now),
    };
  }
}

const sharedReferenceCache = new ValidatedReferencePriceCache();

export function getSharedReferenceCacheStatus(now = Date.now()) {
  return sharedReferenceCache.status(now);
}

export class AggregatedFoundationReferencePriceProvider implements ReferencePriceProvider {
  private lastSourceTimings = { meteoraMs: 0, jupiterMs: 0 };

  constructor(private readonly options: AggregatedReferencePriceOptions) {}

  private get sourceTimeoutMs() {
    return this.options.sourceTimeoutMs ?? FOUNDATION_REFERENCE_SOURCE_TIMEOUT_MS;
  }

  private get sourceRetries() {
    return this.options.sourceRetries ?? 1;
  }

  async getReferencePrice(_inputLamports: bigint, _buyer: PublicKey): Promise<ReferencePrice> {
    void _inputLamports;
    void _buyer;

    const now = this.options.now?.() ?? Date.now();
    const cache = this.options.cache ?? sharedReferenceCache;

    // 1. Cooldown check (Fail-closed), including before cache reuse.
    if (this.options.controlStore) {
      const cooldownUntil = await this.options.controlStore.getCooldownUntil();
      if (cooldownUntil > now) {
        throw new FoundationReferencePriceUnavailableError(
          "Foundation Direct sale is temporarily in cooldown due to extreme market price volatility or rapid movement. Try again later.",
        );
      }
    }

    const cached = cache.get(now);
    if (cached) {
      logDevelopmentTiming({
        event: "foundation_reference_timing",
        cacheHit: true,
        validSourceCount: null,
        meteoraMs: 0,
        jupiterMs: 0,
        validationMs: 0,
        bottleneck: "cache",
      });
      return cached;
    }

    const { candidates, outcomes } = await this.collectCandidates();
    const validationStartedAt = performance.now();
    if (candidates.length < this.options.minSourceCount) {
      logDevelopmentTiming({
        event: "foundation_reference_timing",
        cacheHit: false,
        validSourceCount: candidates.length,
        outcomes,
        meteoraMs: roundedMs(this.lastSourceTimings.meteoraMs),
        jupiterMs: roundedMs(this.lastSourceTimings.jupiterMs),
      });
      throw new FoundationReferencePriceUnavailableError();
    }

    const sorted = [...candidates].sort(compareCandidates);
    const median = sorted[Math.floor(sorted.length / 2)];
    const maxDivergenceBps = Math.max(...candidates.map((candidate) => Number(divergenceBps(candidate, median))));
    if (maxDivergenceBps > this.options.maxDivergenceBps) {
      throw new FoundationReferencePriceUnavailableError(
        "Foundation reference price sources diverged beyond the configured limit.",
      );
    }

    const priceRatio = Number(median.numerator) / Number(median.denominator); // GTREE per SOL ratio

    // 2. Price Volatility & TWAP movement checks (Fail-closed)
    if (this.options.controlStore) {
      const observations = await this.options.controlStore.getPriceObservations();
      if (observations.length > 0) {
        const sum = observations.reduce((acc: number, obs: { priceGtreePerSol: string }) => acc + Number(obs.priceGtreePerSol), 0);
        const twap = sum / observations.length;
        const lastObs = observations[observations.length - 1];
        const lastPrice = Number(lastObs.priceGtreePerSol);

        const changeFromLast = Math.abs(priceRatio - lastPrice) / lastPrice;
        const changeFromTwap = Math.abs(priceRatio - twap) / twap;
        const maxAllowedChangePct = 0.10; // Strict 10% maximum price movement limit

        if (changeFromLast > maxAllowedChangePct || changeFromTwap > maxAllowedChangePct) {
          const cooldownDurationMs = 60 * 60 * 1000; // 1 hour cooldown
          await this.options.controlStore.setCooldownUntil(Date.now() + cooldownDurationMs);
          throw new FoundationReferencePriceUnavailableError(
            "Abnormal price movement detected in references. Initiating fail-closed pricing cooldown to mitigate flash-loan/manipulation risk.",
          );
        }
      }

      // Record this stable observation
      await this.options.controlStore.recordPriceObservation(priceRatio.toFixed(6), now);
    }

    const solPriceUsdCents = median.solPriceUsdCents ?? candidates.find((candidate) => candidate.solPriceUsdCents !== null)?.solPriceUsdCents ?? null;
    const price: ReferencePrice = {
      source: `Rolling median: ${candidates.map((candidate) => candidate.label).join(", ")}`,
      fetchedAt: new Date(),
      priceNumerator: median.numerator,
      priceDenominator: median.denominator,
      solPriceUsdCents,
      gtreePriceUsdMicros: solPriceUsdCents === null ? null : gtreeUsdMicros(median, solPriceUsdCents),
      diagnostics: {
        candidates: candidates.map((candidate) => ({
          label: candidate.label,
          fetchedAt: candidate.fetchedAt.toISOString(),
          numerator: candidate.numerator.toString(),
          denominator: candidate.denominator.toString(),
        })),
        maxDivergenceBps,
        maxAllowedDivergenceBps: this.options.maxDivergenceBps,
        validSourceCount: candidates.length,
        outcomes,
      },
    };
    const validationMs = performance.now() - validationStartedAt;
    const oldestCandidateMs = Math.min(...candidates.map((candidate) => candidate.fetchedAt.getTime()));
    cache.set(
      price,
      Math.min(
        now + (this.options.cacheTtlMs ?? FOUNDATION_REFERENCE_CACHE_TTL_MS),
        oldestCandidateMs + this.options.maxSourceAgeMs,
      ),
      now,
    );
    logDevelopmentTiming({
      event: "foundation_reference_timing",
      cacheHit: false,
      validSourceCount: candidates.length,
      outcomes,
      meteoraMs: roundedMs(this.lastSourceTimings.meteoraMs),
      jupiterMs: roundedMs(this.lastSourceTimings.jupiterMs),
      validationMs: roundedMs(validationMs),
      bottleneck: [
        ["meteora", this.lastSourceTimings.meteoraMs],
        ["jupiter", this.lastSourceTimings.jupiterMs],
        ["validation", validationMs],
      ].sort((left, right) => Number(right[1]) - Number(left[1]))[0][0],
    });
    return price;
  }

  private async collectCandidates(): Promise<{
    candidates: FoundationPriceCandidate[];
    outcomes: Array<{ source: string; durationMs: number; outcome: SourceOutcome }>;
  }> {
    const outcomes: Array<{ source: string; durationMs: number; outcome: SourceOutcome }> = [];
    const timed = async (label: string, load: () => Promise<FoundationPriceCandidate>) => {
      const startedAt = performance.now();
      try {
        const value = await load();
        outcomes.push({ source: label, durationMs: roundedMs(performance.now() - startedAt), outcome: "success" });
        return value;
      } catch (error) {
        outcomes.push({
          source: label,
          durationMs: roundedMs(performance.now() - startedAt),
          outcome: classifySourceOutcome(error),
        });
        throw error;
      }
    };

    const settled = await Promise.allSettled([
      timed("meteora", () => this.options.loadMeteoraCandidate?.() ?? this.meteoraSpotCandidate()),
      ...this.options.probeLamports.map((amount, index) =>
        timed(`jupiter-${index}`, () => this.options.loadJupiterCandidate?.(amount) ?? this.jupiterProbeCandidate(amount))),
    ]);

    const meteoraMs = outcomes.find((item) => item.source === "meteora")?.durationMs ?? 0;
    const jupiterMs = Math.max(
      0,
      ...outcomes.filter((item) => item.source.startsWith("jupiter-")).map((item) => item.durationMs),
    );
    this.lastSourceTimings = { meteoraMs, jupiterMs };
    logDevelopmentTiming({
      event: "foundation_reference_source_timing",
      outcomes,
      meteoraMs: roundedMs(meteoraMs),
      jupiterMs: roundedMs(jupiterMs),
      bottleneck: meteoraMs >= jupiterMs ? "meteora" : "jupiter",
    });

    const now = this.options.now?.() ?? Date.now();
    const candidates = settled
      .filter((item): item is PromiseFulfilledResult<FoundationPriceCandidate> => item.status === "fulfilled")
      .map((item) => item.value)
      .filter((candidate) => now - candidate.fetchedAt.getTime() <= this.options.maxSourceAgeMs);
    return { candidates, outcomes };
  }

  private async meteoraSpotCandidate(): Promise<FoundationPriceCandidate> {
    const pool = await fetchMeteoraPool({
      timeoutMs: this.sourceTimeoutMs,
      retries: this.sourceRetries,
    });
    const priceSolPerGtree = decimalToRational(pool.currentPriceSol);
    return {
      label: "Meteora spot",
      fetchedAt: new Date(),
      numerator: TOKEN_SCALE * priceSolPerGtree.denominator,
      denominator: priceSolPerGtree.numerator * LAMPORTS_PER_SOL,
      solPriceUsdCents: BigInt(Math.round(pool.solPriceUsd * 100)),
    };
  }

  private async jupiterProbeCandidate(inputLamports: bigint): Promise<FoundationPriceCandidate> {
    if (inputLamports <= 0n) throw new Error("Jupiter probe amount must be positive.");
    const quote = await fetchJson<JupiterProbeQuoteResponse>(
      `${SERVER_ENV.jupiterApiBaseUrl}/quote?${new URLSearchParams({
        inputMint: WRAPPED_SOL_MINT,
        outputMint: ENV.gtreeMint,
        amount: inputLamports.toString(),
        slippageBps: String(this.options.slippageBps),
        swapMode: "ExactIn",
        restrictIntermediateTokens: "true",
        onlyDirectRoutes: "true",
      })}`,
      {
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          ...(SERVER_ENV.jupiterApiKey ? { "x-api-key": SERVER_ENV.jupiterApiKey } : {}),
        },
      },
      {
        source: "Jupiter reference probe",
        timeoutMs: this.sourceTimeoutMs,
        retries: this.sourceRetries,
      },
    );

    const routeIsConfirmedPool =
      Array.isArray(quote.routePlan) &&
      quote.routePlan.length > 0 &&
      quote.routePlan.every((leg) =>
        leg.swapInfo?.ammKey === GTREE_POOL_ADDRESS &&
        leg.swapInfo.inputMint === WRAPPED_SOL_MINT &&
        leg.swapInfo.outputMint === ENV.gtreeMint,
      );

    if (
      quote.inputMint !== WRAPPED_SOL_MINT ||
      quote.outputMint !== ENV.gtreeMint ||
      quote.inAmount !== inputLamports.toString() ||
      !validRawAmount(quote.outAmount) ||
      !routeIsConfirmedPool
    ) {
      throw new Error("Jupiter reference probe returned an invalid GTREE route.");
    }

    return {
      label: `Jupiter ${inputLamports.toString()} lamport probe`,
      fetchedAt: new Date(),
      numerator: BigInt(quote.outAmount),
      denominator: inputLamports,
      solPriceUsdCents: null,
    };
  }
}

function classifySourceOutcome(error: unknown): SourceOutcome {
  if (error instanceof ExternalRequestError) return error.outcome;
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  return "invalid";
}

function validRawAmount(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d*$/.test(value);
}

function compareCandidates(a: FoundationPriceCandidate, b: FoundationPriceCandidate): number {
  const left = a.numerator * b.denominator;
  const right = b.numerator * a.denominator;
  return left < right ? -1 : left > right ? 1 : 0;
}

function divergenceBps(candidate: FoundationPriceCandidate, median: FoundationPriceCandidate): bigint {
  const left = candidate.numerator * median.denominator;
  const right = median.numerator * candidate.denominator;
  const delta = left > right ? left - right : right - left;
  return (delta * 10_000n) / (median.numerator * candidate.denominator);
}

function gtreeUsdMicros(price: FoundationPriceCandidate, solPriceUsdCents: bigint): bigint {
  return (solPriceUsdCents * TOKEN_SCALE * price.denominator * 10_000n) / (price.numerator * LAMPORTS_PER_SOL);
}

function roundedMs(value: number) {
  return Math.round(value * 10) / 10;
}

function logDevelopmentTiming(payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "development") console.info(JSON.stringify(payload));
}

function decimalToRational(value: number): { numerator: bigint; denominator: bigint } {
  if (!Number.isFinite(value) || value <= 0) throw new Error("Invalid decimal price.");
  const fixed = value.toFixed(18).replace(/0+$/, "").replace(/\.$/, "");
  const [whole, fraction = ""] = fixed.split(".");
  return {
    numerator: BigInt(whole + fraction),
    denominator: 10n ** BigInt(fraction.length),
  };
}
