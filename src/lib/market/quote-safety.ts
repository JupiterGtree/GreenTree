export const WEBSITE_PRICE_IMPACT_LIMIT_PCT = 15;
export const SOL_FEE_RESERVE_LAMPORTS = BigInt(5_000_000);

export type PriceImpactSeverity = "normal" | "noticeable" | "high" | "extreme";

export function getPriceImpactSeverity(priceImpactPct: number): PriceImpactSeverity {
  if (priceImpactPct < 1) return "normal";
  if (priceImpactPct < 5) return "noticeable";
  if (priceImpactPct <= WEBSITE_PRICE_IMPACT_LIMIT_PCT) return "high";
  return "extreme";
}

export function isWebsitePurchaseBlocked(priceImpactPct: number): boolean {
  return priceImpactPct > WEBSITE_PRICE_IMPACT_LIMIT_PCT;
}

export function spendableLamports(balanceLamports: string): bigint {
  const balance = BigInt(balanceLamports);
  return balance > SOL_FEE_RESERVE_LAMPORTS ? balance - SOL_FEE_RESERVE_LAMPORTS : BigInt(0);
}
