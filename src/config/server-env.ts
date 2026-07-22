import "server-only";

import { GTREE_POOL_ADDRESS } from "@/lib/constants/env";

function validHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("A configured data-source URL must use HTTP or HTTPS.");
  }
  return url.toString().replace(/\/$/, "");
}

export const SERVER_ENV = {
  solanaRpcUrl: validHttpUrl(
    process.env.SOLANA_RPC_URL ||
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      "https://api.mainnet-beta.solana.com",
  ),
  meteoraPoolApiUrl: validHttpUrl(
    process.env.METEORA_POOL_API_URL ||
      process.env.NEXT_PUBLIC_MARKET_API_URL ||
      `https://damm-v2.datapi.meteora.ag/pools/${GTREE_POOL_ADDRESS}`,
  ),
  jupiterApiBaseUrl: validHttpUrl(
    process.env.JUPITER_API_BASE_URL || "https://lite-api.jup.ag/swap/v1",
  ),
  jupiterApiKey: process.env.JUPITER_API_KEY?.trim() || null,
  purchaseMode:
    process.env.PURCHASE_MODE === "FOUNDATION_DIRECT" ||
    process.env.PURCHASE_MODE === "PAUSED"
      ? process.env.PURCHASE_MODE
      : "MARKET",
} as const;
