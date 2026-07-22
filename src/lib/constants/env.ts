import { PROJECT } from "./project";

export const GTREE_POOL_ADDRESS = "4EfPeDK4XEfpBXDsu6NwHTaGqh3CzPPT6jCemU5FeWJE";
export const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

export const ENV = {
  gtreeMint: PROJECT.mint,
  dexUrl:
    process.env.NEXT_PUBLIC_DEX_URL ||
    `https://jup.ag/swap/SOL-${PROJECT.mint}`,
  solscanBaseUrl: process.env.NEXT_PUBLIC_SOLSCAN_BASE_URL || "https://solscan.io",
} as const;

export const isDexConfigured = Boolean(ENV.dexUrl);
