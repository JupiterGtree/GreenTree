import "server-only";

import { DATA_SOURCES } from "@/config/data-sources";
import { SERVER_ENV } from "@/config/server-env";
import { ENV, GTREE_POOL_ADDRESS, WRAPPED_SOL_MINT } from "@/lib/constants/env";
import { fetchJson } from "@/services/http/fetch-json";

export interface MeteoraPoolState {
  address: string;
  name: string;
  currentPriceSol: number;
  solPriceUsd: number;
  tokenXAmount: number | null;
  tokenYAmount: number | null;
  tvlUsd: number | null;
  volume24hUsd: number | null;
  fees24hUsd: number | null;
  isBlacklisted: boolean | null;
}

interface MeteoraPoolResponse {
  address?: unknown;
  name?: unknown;
  current_price?: unknown;
  token_x?: { address?: unknown };
  token_y?: { address?: unknown; price?: unknown };
  token_x_amount?: unknown;
  token_y_amount?: unknown;
  volume?: { "24h"?: unknown };
  fees?: { "24h"?: unknown };
  tvl?: unknown;
  is_blacklisted?: unknown;
}

interface GeckoTerminalPoolResponse {
  data?: {
    id?: unknown;
    type?: unknown;
    attributes?: {
      address?: unknown;
      name?: unknown;
      pool_name?: unknown;
      base_token_price_usd?: unknown;
      base_token_price_native_currency?: unknown;
      base_token_price_quote_token?: unknown;
      quote_token_price_usd?: unknown;
      quote_token_price_base_token?: unknown;
      fdv_usd?: unknown;
      market_cap_usd?: unknown;
      reserve_in_usd?: unknown;
      volume_usd?: { h24?: unknown };
    };
    relationships?: {
      base_token?: { data?: { id?: unknown; type?: unknown } };
      quote_token?: { data?: { id?: unknown; type?: unknown } };
      dex?: { data?: { id?: unknown; type?: unknown } };
    };
  };
}

function positiveNumber(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Meteora returned an invalid ${label}.`);
  }
  return parsed;
}

function nullableNonNegativeNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function fetchMeteoraPool(options?: {
  timeoutMs?: number;
  retries?: number;
  failureLog?: "error" | "warn" | "none";
}): Promise<MeteoraPoolState> {
  const response = await fetchJson<MeteoraPoolResponse | GeckoTerminalPoolResponse>(
    SERVER_ENV.meteoraPoolApiUrl,
    { cache: "no-store" },
    {
      source: "GeckoTerminal Meteora DAMM v2 pool",
      timeoutMs: options?.timeoutMs ?? DATA_SOURCES["meteora-pool"].timeoutMs,
      retries: options?.retries ?? 2,
      failureLog: options?.failureLog,
    },
  );

  if ("data" in response && response.data?.attributes) {
    return mapGeckoTerminalPool(response as GeckoTerminalPoolResponse);
  }

  const pool = response as MeteoraPoolResponse;
  if (
    pool.address !== GTREE_POOL_ADDRESS ||
    pool.token_x?.address !== ENV.gtreeMint ||
    pool.token_y?.address !== WRAPPED_SOL_MINT
  ) {
    throw new Error("Meteora returned a different pool or token pair.");
  }

  return {
    address: pool.address,
    name: typeof pool.name === "string" && pool.name.trim() ? pool.name : "GTREE-SOL",
    currentPriceSol: positiveNumber(pool.current_price, "GTREE/SOL price"),
    solPriceUsd: positiveNumber(pool.token_y.price, "SOL/USD price"),
    tokenXAmount: nullableNonNegativeNumber(pool.token_x_amount),
    tokenYAmount: nullableNonNegativeNumber(pool.token_y_amount),
    tvlUsd: nullableNonNegativeNumber(pool.tvl),
    volume24hUsd: nullableNonNegativeNumber(pool.volume?.["24h"]),
    fees24hUsd: nullableNonNegativeNumber(pool.fees?.["24h"]),
    isBlacklisted: typeof pool.is_blacklisted === "boolean" ? pool.is_blacklisted : null,
  };
}

function mapGeckoTerminalPool(response: GeckoTerminalPoolResponse): MeteoraPoolState {
  const attributes = response.data?.attributes;
  const baseTokenId = response.data?.relationships?.base_token?.data?.id;
  const quoteTokenId = response.data?.relationships?.quote_token?.data?.id;
  const dexId = response.data?.relationships?.dex?.data?.id;

  if (
    attributes?.address !== GTREE_POOL_ADDRESS ||
    baseTokenId !== `solana_${ENV.gtreeMint}` ||
    quoteTokenId !== `solana_${WRAPPED_SOL_MINT}` ||
    dexId !== "meteora-damm-v2"
  ) {
    throw new Error("GeckoTerminal returned a different pool or token pair.");
  }

  return {
    address: attributes.address,
    name: typeof attributes.pool_name === "string" && attributes.pool_name.trim()
      ? attributes.pool_name
      : typeof attributes.name === "string" && attributes.name.trim()
        ? attributes.name
        : "GTREE / SOL",
    currentPriceSol: positiveNumber(
      attributes.base_token_price_native_currency ?? attributes.base_token_price_quote_token,
      "GTREE/SOL reference price",
    ),
    solPriceUsd: positiveNumber(attributes.quote_token_price_usd, "SOL/USD price"),
    tokenXAmount: null,
    tokenYAmount: null,
    tvlUsd: nullableNonNegativeNumber(attributes.reserve_in_usd),
    volume24hUsd: nullableNonNegativeNumber(attributes.volume_usd?.h24),
    fees24hUsd: null,
    isBlacklisted: null,
  };
}
