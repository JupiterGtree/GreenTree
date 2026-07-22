import "server-only";

import { unstable_cache } from "next/cache";
import { resolveRuntimeSetting } from "@/lib/admin/runtime-settings";
import { GTREE_POOL_ADDRESS } from "@/lib/constants/env";
import { fetchMeteoraPool } from "@/services/meteora/pool";
import { getTokenState } from "@/data/token/get-token-state";
import { readyData, unavailableData, type DataResult } from "@/types/data";
import type { MarketSnapshot } from "@/types/market";
import { isPriceSnapshotConsistent, marketSnapshotId } from "@/lib/market/price-snapshot";

async function readMarketSnapshot(): Promise<DataResult<MarketSnapshot>> {
  try {
    const [pool, tokenState] = await Promise.all([fetchMeteoraPool(), getTokenState()]);
    const priceUsd = pool.currentPriceSol * pool.solPriceUsd;
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
      throw new Error("Unable to derive a valid GTREE/USD price.");
    }

    const supply = tokenState.data ? Number(tokenState.data.supplyUi) : null;
    const impliedValuationUsd = supply !== null && Number.isFinite(supply)
      ? priceUsd * supply
      : null;
    const reserveLiquidityUsd = pool.tokenYAmount !== null
      ? pool.tokenYAmount * pool.solPriceUsd * 2
      : null;
    const liquidityUsd = pool.tvlUsd !== null && pool.tvlUsd > 0
      ? pool.tvlUsd
      : reserveLiquidityUsd;
    const priceAdjustmentBps = Number(resolveRuntimeSetting("priceAdjustmentBps"));
    const referenceGtreePerSol = 1 / pool.currentPriceSol;
    const effectiveGtreePerSol = referenceGtreePerSol * (10_000 + priceAdjustmentBps) / 10_000;
    const fetchedAt = new Date();
    const fetchedAtIso = fetchedAt.toISOString();
    const referenceRate = decimalRate(referenceGtreePerSol);
    const effectiveRate = decimalRate(effectiveGtreePerSol);
    if (!isPriceSnapshotConsistent({
      solUsd: pool.solPriceUsd,
      gtreeUsd: priceUsd,
      gtreePerSol: referenceRate,
    })) {
      console.warn(JSON.stringify({
        event: "market_snapshot_consistency_rejected",
        source: "meteora-pool",
        retryable: true,
      }));
      return unavailableData<MarketSnapshot>(
        "meteora-pool",
        "Market price sources failed consistency validation.",
      );
    }
    const snapshotId = marketSnapshotId({
      source: "Meteora DAMM v2",
      solUsd: pool.solPriceUsd,
      gtreeUsd: priceUsd,
      effectiveGtreePerSol: effectiveRate,
    });

    return readyData<MarketSnapshot>(
      {
        snapshotId,
        gtreeUsd: priceUsd,
        solUsd: pool.solPriceUsd,
        gtreePerSol: referenceRate,
        priceUsd,
        priceSol: pool.currentPriceSol,
        solPriceUsd: pool.solPriceUsd,
        referenceGtreePerSol: referenceRate,
        effectiveGtreePerSol: effectiveRate,
        priceAdjustmentBps,
        fetchedAt: fetchedAtIso,
        expiresAt: new Date(fetchedAt.getTime() + 20_000).toISOString(),
        sourceStatus: "LIVE",
        change24hPct: null,
        marketCapUsd: impliedValuationUsd,
        fdvUsd: impliedValuationUsd,
        liquidityUsd,
        liquiditySource: pool.tvlUsd !== null && pool.tvlUsd > 0 ? "Meteora TVL" : "Reserve-derived estimate",
        volume24hUsd: pool.volume24hUsd,
        holders: null,
        updatedAt: fetchedAtIso,
        source: "Meteora DAMM v2",
        poolAddress: GTREE_POOL_ADDRESS,
        poolUrl: `https://app.meteora.ag/pools/${GTREE_POOL_ADDRESS}`,
        dex: "Meteora DAMM v2",
        pairName: pool.name,
        buys24h: null,
        sells24h: null,
        fee24hUsd: pool.fees24hUsd,
        isBlacklisted: pool.isBlacklisted,
      },
      "meteora-pool",
      "solana-mainnet",
      fetchedAtIso,
    );
  } catch (error) {
    return unavailableData<MarketSnapshot>(
      "meteora-pool",
      error instanceof Error ? error.message : "Live GTREE market data is unavailable.",
    );
  }
}

export const getMarketSnapshot = unstable_cache(readMarketSnapshot, ["gtree-market-snapshot-v2"], {
  revalidate: 15,
  tags: ["gtree-market-snapshot"],
});

function decimalRate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) throw new Error("Unable to derive a valid GTREE/SOL rate.");
  return value.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
}
