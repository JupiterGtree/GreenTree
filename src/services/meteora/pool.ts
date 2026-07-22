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
  const pool = await fetchJson<MeteoraPoolResponse>(
    SERVER_ENV.meteoraPoolApiUrl,
    { cache: "no-store" },
    {
      source: "Meteora DAMM v2",
      timeoutMs: options?.timeoutMs ?? DATA_SOURCES["meteora-pool"].timeoutMs,
      retries: options?.retries ?? 1,
      failureLog: options?.failureLog,
    },
  );

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
