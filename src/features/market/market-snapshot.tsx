"use client";

import { Coins, Droplets, ExternalLink, Gauge, Landmark, Wallet } from "lucide-react";
import { MarketMetric } from "@/features/market/market-metric";
import { PriceChange } from "@/features/market/price-change";
import { AnimatedCompactUsd, AnimatedSolPrice, AnimatedUsd } from "@/components/shared/animated-number";
import { DataSourceBadge } from "@/components/shared/data-badges";
import { RelativeTime } from "@/components/shared/relative-time";
import { GTREE_POOL_ADDRESS } from "@/lib/constants/env";
import { useSharedMarketSnapshot } from "@/lib/market/shared-client-snapshots";
import { cn } from "@/lib/utils";
import { isMarketSnapshotExpired } from "@/lib/market/price-snapshot";

export function MarketSnapshot({ compact = false, className }: { compact?: boolean; className?: string }) {
  const shared = useSharedMarketSnapshot();
  const result = shared.value;
  const snapshot = result?.data ?? null;
  const stale = Boolean(
    snapshot && (
      result?.stale ||
      snapshot.sourceStatus !== "LIVE" ||
      isMarketSnapshotExpired(snapshot)
    ),
  );

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full",
              stale ? "bg-gt-warning" : snapshot ? "bg-gt-emerald-bright" : "bg-gt-danger",
            )}
            aria-hidden
          />
          <span className="text-sm text-gt-muted">{stale ? "Market snapshot stale" : snapshot ? "Solana Mainnet operational" : shared.loading ? "Loading Solana Mainnet data" : "Market data unavailable"}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gt-muted-2">
          <DataSourceBadge mode="live" source={snapshot?.source ?? "Source unavailable"} />
          {result?.fetchedAt && <span>Updated <RelativeTime iso={result.fetchedAt} /></span>}
        </div>
      </div>

      <div
        className={cn(
          "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5",
          !compact && "xl:grid-cols-7",
        )}
      >
        <MarketMetric
          label="Price (USD)"
          icon={Coins}
          value={snapshot && (
            <div className="flex items-baseline gap-2">
              <AnimatedUsd value={snapshot.gtreeUsd} />
              {snapshot.change24hPct !== null && <PriceChange value={snapshot.change24hPct} />}
            </div>
          )}
          state={snapshot ? "ready" : "unavailable"}
          helper="GTREE/SOL × SOL/USD"
        />
        <MarketMetric
          label="Price (SOL)"
          icon={Gauge}
          value={snapshot && <AnimatedSolPrice value={snapshot.priceSol} />}
          state={snapshot ? "ready" : "unavailable"}
          helper={snapshot ? `SOL/USD ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(snapshot.solUsd)}` : undefined}
        />
        <MarketMetric
          label="Implied valuation"
          icon={Landmark}
          value={snapshot?.marketCapUsd !== null && snapshot?.marketCapUsd !== undefined ? <AnimatedCompactUsd value={snapshot.marketCapUsd} /> : undefined}
          state={snapshot?.marketCapUsd !== null && snapshot?.marketCapUsd !== undefined ? "ready" : "unavailable"}
          helper="Spot price × verified on-chain supply"
        />
        <MarketMetric
          label="Liquidity"
          icon={Droplets}
          value={snapshot?.liquidityUsd !== null && snapshot?.liquidityUsd !== undefined ? <AnimatedCompactUsd value={snapshot.liquidityUsd} /> : undefined}
          state={snapshot?.liquidityUsd !== null && snapshot?.liquidityUsd !== undefined ? "ready" : "unavailable"}
          helper={snapshot?.liquiditySource}
        />
        {!compact && (
          <MarketMetric
            label="Fully diluted valuation"
            icon={Wallet}
            value={snapshot?.fdvUsd !== null && snapshot?.fdvUsd !== undefined ? <AnimatedCompactUsd value={snapshot.fdvUsd} /> : undefined}
            state={snapshot?.fdvUsd !== null && snapshot?.fdvUsd !== undefined ? "ready" : "unavailable"}
            helper="At verified on-chain supply"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gt-border pt-3 text-xs text-gt-muted-2">
        <span>{snapshot ? `${snapshot.pairName} · ${snapshot.dex}` : "Live pool data temporarily unavailable"}</span>
        <a
          href={snapshot?.poolUrl ?? `https://app.meteora.ag/pools/${GTREE_POOL_ADDRESS}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-gt-emerald-bright hover:text-gt-offwhite"
        >
          Verify pool <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>

      {!snapshot && (
        <p role="status" className="text-xs text-gt-muted-2">
          {shared.error || result?.error || "Live market data is temporarily unavailable."}
        </p>
      )}
    </div>
  );
}
