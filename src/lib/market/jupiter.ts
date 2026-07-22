import "server-only";

import { DATA_SOURCES } from "@/config/data-sources";
import { SERVER_ENV } from "@/config/server-env";
import { ENV, GTREE_POOL_ADDRESS, WRAPPED_SOL_MINT } from "@/lib/constants/env";
import { PROJECT } from "@/lib/constants/project";
import { fetchJson } from "@/services/http/fetch-json";
import { fetchMeteoraPool } from "@/services/meteora/pool";
import type { QuoteResult } from "@/types/market";
import { atomicToDecimal, decimalToAtomic } from "@/lib/market/amounts";
import { WEBSITE_PRICE_IMPACT_LIMIT_PCT } from "@/lib/market/quote-safety";

const SOL_DECIMALS = 9;
const LOCAL_QUOTE_FRESHNESS_MS = 15_000;

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  slippageBps: number;
  contextSlot?: number;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
    };
    percent: number;
  }>;
  [key: string]: unknown;
}

function jupiterHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(SERVER_ENV.jupiterApiKey ? { "x-api-key": SERVER_ENV.jupiterApiKey } : {}),
  };
}

function validAmount(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d*$/.test(value);
}

export async function fetchJupiterQuote(inputSol: string, slippageBps: number) {
  const parsedInput = decimalToAtomic(inputSol, SOL_DECIMALS);
  const inputSolNumber = Number(parsedInput.normalized);
  if (!Number.isFinite(inputSolNumber) || inputSolNumber <= 0 || inputSolNumber > 500) {
    throw new Error("Enter a SOL amount between 0 and 500.");
  }
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 500) {
    throw new Error("Slippage must be between 0.01% and 5%.");
  }

  const amount = parsedInput.raw;
  const params = new URLSearchParams({
    inputMint: WRAPPED_SOL_MINT,
    outputMint: ENV.gtreeMint,
    amount,
    slippageBps: String(slippageBps),
    swapMode: "ExactIn",
    restrictIntermediateTokens: "true",
    onlyDirectRoutes: "true",
  });
  const quote = await fetchJson<JupiterQuoteResponse>(
    `${SERVER_ENV.jupiterApiBaseUrl}/quote?${params}`,
    { cache: "no-store", headers: jupiterHeaders() },
    {
      source: "Jupiter quote",
      timeoutMs: DATA_SOURCES["jupiter-swap"].timeoutMs,
      retries: 1,
    },
  );

  const impactFraction = Number(quote.priceImpactPct);
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
    quote.inAmount !== amount ||
    quote.slippageBps !== slippageBps ||
    !validAmount(quote.outAmount) ||
    !validAmount(quote.otherAmountThreshold) ||
    !Number.isFinite(impactFraction) ||
    impactFraction < 0 ||
    impactFraction > 1 ||
    !routeIsConfirmedPool
  ) {
    throw new Error("Jupiter did not return a valid route through the confirmed GTREE pool.");
  }
  return { quote, parsedInput };
}

export async function normalizeJupiterQuote(inputSol: string, slippageBps: number): Promise<QuoteResult> {
  const { quote, parsedInput } = await fetchJupiterQuote(inputSol, slippageBps);
  const quoteFetchedAtMs = Date.now();
  const outputGtree = atomicToDecimal(quote.outAmount, PROJECT.decimals);
  const minimumReceivedGtree = atomicToDecimal(quote.otherAmountThreshold, PROJECT.decimals);
  let gtreePriceUsd: number | null = null;
  let solPriceUsd: number | null = null;
  try {
    const pool = await fetchMeteoraPool();
    const derived = pool.currentPriceSol * pool.solPriceUsd;
    gtreePriceUsd = Number.isFinite(derived) && derived > 0 ? derived : null;
    solPriceUsd = Number.isFinite(pool.solPriceUsd) && pool.solPriceUsd > 0 ? pool.solPriceUsd : null;
  } catch {
    gtreePriceUsd = null;
    solPriceUsd = null;
  }
  const fetchedAt = new Date(quoteFetchedAtMs).toISOString();
  const routeLabels = quote.routePlan.map((leg) => leg.swapInfo.label).filter(Boolean);
  const inputUsd = solPriceUsd !== null ? Number(parsedInput.normalized) * solPriceUsd : null;
  const outputUsd = gtreePriceUsd !== null ? Number(outputGtree) * gtreePriceUsd : null;
  const quoteLossUsd = inputUsd !== null && outputUsd !== null ? Math.max(0, inputUsd - outputUsd) : null;
  const quoteLossPct = inputUsd !== null && inputUsd > 0 && outputUsd !== null
    ? Math.max(0, (1 - outputUsd / inputUsd) * 100)
    : null;

  return {
    mode: "MARKET",
    inputSol: parsedInput.normalized,
    inputAmountRaw: parsedInput.raw,
    outputGtree,
    outputAmountRaw: quote.outAmount,
    gtreePriceUsd,
    solPriceUsd,
    inputUsd,
    outputUsd,
    quoteLossUsd,
    quoteLossPct,
    priceImpactPct: Number(quote.priceImpactPct) * 100,
    slippageBps,
    minimumReceivedGtree,
    minimumReceivedRaw: quote.otherAmountThreshold,
    networkFeeSol: null,
    route: [...new Set(routeLabels)].join(" → ") || "Meteora DAMM v2",
    routePlan: quote.routePlan.map((leg) => ({
      label: leg.swapInfo.label,
      poolAddress: leg.swapInfo.ammKey,
      percent: leg.percent,
    })),
    expiresAt: quoteFetchedAtMs + LOCAL_QUOTE_FRESHNESS_MS,
    quoteId: `${quote.contextSlot ?? "slot-unavailable"}-${quote.inAmount}-${quote.outAmount}`,
    poolAddress: GTREE_POOL_ADDRESS,
    source: "Jupiter",
    fetchedAt,
    network: "solana-mainnet",
    inputMint: WRAPPED_SOL_MINT,
    outputMint: ENV.gtreeMint,
    websiteBonus: null,
  };
}

export async function prepareJupiterSwap(
  wallet: string,
  inputSol: string,
  slippageBps: number,
  expectedMinimumReceivedRaw: string,
) {
  const { quote: quoteResponse } = await fetchJupiterQuote(inputSol, slippageBps);
  const priceImpactPct = Number(quoteResponse.priceImpactPct) * 100;
  if (priceImpactPct > WEBSITE_PRICE_IMPACT_LIMIT_PCT) {
    throw new Error("Extreme price impact. Reduce the amount or use Jupiter with its full safeguards.");
  }
  if (!validAmount(expectedMinimumReceivedRaw) || BigInt(quoteResponse.outAmount) < BigInt(expectedMinimumReceivedRaw)) {
    throw new Error("The route changed beyond the reviewed minimum. Refresh the quote before continuing.");
  }
  const payload = await fetchJson<{
    swapTransaction?: string;
    lastValidBlockHeight?: number;
    prioritizationFeeLamports?: number;
    simulationError?: unknown;
  }>(
    `${SERVER_ENV.jupiterApiBaseUrl}/swap`,
    {
      method: "POST",
      headers: jupiterHeaders(),
      body: JSON.stringify({
        quoteResponse,
        userPublicKey: wallet,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      }),
      cache: "no-store",
    },
    {
      source: "Jupiter swap builder",
      timeoutMs: DATA_SOURCES["jupiter-swap"].timeoutMs,
      retries: 0,
    },
  );
  if (!payload.swapTransaction || payload.simulationError) {
    throw new Error("Jupiter could not build a valid GTREE swap transaction.");
  }
  return {
    transaction: payload.swapTransaction,
    lastValidBlockHeight: payload.lastValidBlockHeight ?? null,
    prioritizationFeeLamports: payload.prioritizationFeeLamports ?? null,
  };
}
