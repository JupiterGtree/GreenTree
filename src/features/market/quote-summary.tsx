"use client";

import * as React from "react";
import { ChevronDown, RefreshCw, TimerReset } from "lucide-react";
import type { MarketQuoteResult } from "@/types/market";
import { formatDateTime } from "@/lib/formatters/number";
import { formatDecimalAmount } from "@/lib/market/amounts";
import { getPriceImpactSeverity } from "@/lib/market/quote-safety";
import { shortenAddress } from "@/lib/constants/project";
import { cn } from "@/lib/utils";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-xs">
      <dt className="text-gt-muted-2">{label}</dt>
      <dd className="max-w-[65%] text-right font-medium text-gt-fg">{value}</dd>
    </div>
  );
}

export function QuoteSummary({
  quote,
  onExpire,
  onRefresh,
}: {
  quote: MarketQuoteResult;
  onExpire: () => void;
  onRefresh: () => void;
}) {
  const [remainingMs, setRemainingMs] = React.useState(() => Math.max(0, quote.expiresAt - Date.now()));
  const expiredRef = React.useRef(false);

  React.useEffect(() => {
    expiredRef.current = false;
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, quote.expiresAt - Date.now());
      setRemainingMs(remaining);
      if (remaining === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire();
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [quote.expiresAt, onExpire]);

  const seconds = Math.ceil(remainingMs / 1000);
  const severity = getPriceImpactSeverity(quote.priceImpactPct);

  return (
    <div className="border-y border-gt-border-soft py-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-gt-muted-2">Route</p>
          <p className="mt-1 truncate text-xs font-semibold text-gt-fg" title={`Jupiter → ${quote.route}`}>
            Jupiter → {quote.route}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-gt-muted-2">Price impact</p>
          <p className={cn("tabular mt-1 text-xs font-semibold", severity === "extreme" ? "text-gt-danger" : severity === "high" ? "text-gt-warning" : "text-gt-fg")}>
            {quote.priceImpactPct.toFixed(2)}%
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-gt-muted-2">Max slippage</p>
          <p className="tabular mt-1 text-xs font-semibold text-gt-fg">{(quote.slippageBps / 100).toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-gt-muted-2">Quote expiry</p>
          <div className={cn("mt-1 flex items-center gap-1.5 text-xs font-semibold", seconds <= 5 ? "text-gt-warning" : "text-gt-fg")}>
            <TimerReset className="size-3.5" aria-hidden />
            {seconds > 0 ? `${seconds}s` : "Expired"}
          </div>
        </div>
      </div>

      <details className="group mt-3 border-t border-gt-border-soft pt-2">
        <summary className="flex cursor-pointer list-none items-center justify-between py-1 text-xs font-semibold text-gt-muted transition-colors hover:text-gt-fg focus-visible:outline-none">
          Quote details
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <dl className="mt-1 divide-y divide-gt-border-soft">
          <DetailRow label="Input mint" value={shortenAddress(quote.inputMint, 6)} />
          <DetailRow label="Output mint" value={shortenAddress(quote.outputMint, 6)} />
          <DetailRow
            label="Route plan"
            value={quote.routePlan.map((leg) => `${leg.label} (${leg.percent}%)`).join(" → ")}
          />
          <DetailRow label="Minimum received" value={`${formatDecimalAmount(quote.minimumReceivedGtree, 6)} GTREE`} />
          <DetailRow label="Expected network fee" value={quote.networkFeeSol ? `${quote.networkFeeSol} SOL` : "Confirmed in wallet"} />
          <DetailRow label="Quote timestamp" value={formatDateTime(quote.fetchedAt)} />
          <DetailRow label="Source" value={`${quote.source} · Solana Mainnet`} />
        </dl>
      </details>

      <button
        type="button"
        onClick={onRefresh}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-gt-emerald-bright hover:text-gt-offwhite"
        aria-label="Refresh the Jupiter quote"
      >
        <RefreshCw className="size-3.5" aria-hidden />
        Refresh quote
      </button>
    </div>
  );
}
