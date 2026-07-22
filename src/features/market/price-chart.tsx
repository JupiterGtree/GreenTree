"use client";

import * as React from "react";
import {
  Area,
  Bar,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, ExternalLink } from "lucide-react";
import { TimeRangeSelector } from "@/features/market/time-range-selector";
import { PriceChange } from "@/features/market/price-change";
import { LiveDataBadge } from "@/components/shared/data-badges";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getMarketProvider } from "@/lib/providers/market-provider";
import type { ChartQuote, ChartRange, PriceHistory } from "@/types/market";
import { formatUsd } from "@/lib/formatters/number";
import { cn } from "@/lib/utils";
import { ENV, GTREE_POOL_ADDRESS } from "@/lib/constants/env";
import { useSharedMarketSnapshot } from "@/lib/market/shared-client-snapshots";

export function formatMarketAxisTime(ts: number, range: ChartRange): string {
  const date = new Date(ts);
  if (range === "1H" || range === "24H") {
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatMarketDateTime(ts: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(ts));
}

export function formatMarketDate(ts: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ts));
}

function formatPriceValue(value: number, quote: ChartQuote): string {
  if (quote === "USD") return formatUsd(value, { decimals: value < 1 ? 6 : 2 });
  return `${value.toFixed(9)} SOL`;
}

interface TooltipPayloadItem {
  payload: { timestamp: number; price: number; volume: number };
}

function ChartTooltip({
  active,
  payload,
  quote,
  range,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  quote: ChartQuote;
  range: ChartRange;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-gt-border bg-gt-charcoal-2 px-3 py-2 text-xs shadow-md">
      <p className="text-gt-muted">{formatMarketAxisTime(point.timestamp, range)}</p>
      <p className="tabular mt-0.5 font-semibold text-gt-offwhite">{formatPriceValue(point.price, quote)}</p>
    </div>
  );
}

type ChartView =
  | { quote: ChartQuote; range: ChartRange; status: "ready"; history: PriceHistory }
  | { quote: ChartQuote; range: ChartRange; status: "empty"; history: PriceHistory }
  | { quote: ChartQuote; range: ChartRange; status: "error" };

export function PriceChart() {
  const sharedSnapshot = useSharedMarketSnapshot();
  const snapshotId = sharedSnapshot.value?.data?.snapshotId;
  const [quote, setQuote] = React.useState<ChartQuote>("USD");
  const [range, setRange] = React.useState<ChartRange>("7D");
  const [view, setView] = React.useState<ChartView | null>(null);

  const isCurrent =
    view !== null
    && view.quote === quote
    && view.range === range
    && view.status !== "error"
    && view.history.snapshotId === snapshotId;
  const state = !snapshotId
    ? sharedSnapshot.loading ? "loading" : "error"
    : isCurrent ? view.status : "loading";
  const history = isCurrent && (view.status === "ready" || view.status === "empty") ? view.history : null;

  React.useEffect(() => {
    if (!snapshotId) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await getMarketProvider().getPriceHistory(quote, range, snapshotId);
        if (cancelled) return;
        if (result.snapshotId !== snapshotId) throw new Error("Chart snapshot does not match the market snapshot.");
        if (!result.points.length) {
          setView({ quote, range, status: "empty", history: result });
          return;
        }
        setView({ quote, range, status: "ready", history: result });
      } catch {
        if (!cancelled) setView({ quote, range, status: "error" });
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [quote, range, snapshotId]);

  return (
    <div className="flex flex-col gap-4" data-snapshot-id={history?.snapshotId ?? snapshotId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            role="group"
            aria-label="Select quote currency"
            className="inline-flex items-center gap-1 rounded-lg border border-gt-border bg-gt-surface p-1"
          >
            {(["USD", "SOL"] as ChartQuote[]).map((q) => (
              <button
                key={q}
                type="button"
                aria-pressed={quote === q}
                onClick={() => setQuote(q)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
                  quote === q ? "bg-gt-emerald text-gt-black" : "text-gt-muted hover:text-gt-fg",
                )}
              >
                GTREE/{q}
              </button>
            ))}
          </div>
          <LiveDataBadge />
        </div>
        <TimeRangeSelector value={range} onChange={setRange} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-y border-gt-border/80 py-2 text-[11px] text-gt-muted-2">
        <span className="font-medium text-gt-fg">Meteora DAMM v2</span>
        <span>GTREE / SOL pool</span>
        <span>Execution routed by Jupiter</span>
        <a href={`https://app.meteora.ag/pools/${GTREE_POOL_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-gt-emerald-bright hover:text-gt-offwhite">
          View pool <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>

      {state === "loading" && (
        <div className="flex h-64 flex-col gap-2 sm:h-80">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
      )}

      {state === "error" && <ErrorState title="Chart data unavailable" description="Could not load GTREE price history right now." />}

      {state === "empty" && history && (
        <div className="grid min-h-64 place-items-center rounded-md border border-dashed border-gt-border bg-gt-surface/35 px-6 py-8 text-center sm:min-h-80">
          <div className="max-w-md">
            <span className="mx-auto flex size-10 items-center justify-center rounded-md bg-gt-surface-2 text-gt-emerald-bright"><Activity className="size-4" aria-hidden /></span>
            <p className="mt-4 font-semibold text-gt-offwhite">No pool swaps in this window</p>
            <p className="mt-2 text-sm leading-6 text-gt-muted">
              {typeof history.spotPrice === "number"
                ? <>The verified pool spot price is <strong className="text-gt-fg">{formatPriceValue(history.spotPrice, quote)}</strong>. Select another range to check the available history.</>
                : <>The pool spot price is temporarily unavailable. Select another range or try again later.</>}
            </p>
            {history.lastTradeAt && <p className="mt-2 text-xs text-gt-muted-2">Last recorded Meteora activity: {formatMarketDateTime(history.lastTradeAt)}</p>}
            <a href={ENV.dexUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gt-emerald-bright hover:text-gt-offwhite">Buy through Jupiter <ExternalLink className="size-3.5" aria-hidden /></a>
          </div>
        </div>
      )}

      {state === "ready" && history && (
        <div>
          <div className="mb-2 flex items-baseline gap-3">
            <span className="tabular text-2xl font-semibold text-gt-offwhite">
              {formatPriceValue(history.points[history.points.length - 1].price, quote)}
            </span>
            {history.changePct === null ? <span className="text-xs text-gt-muted">Change unavailable</span> : <PriceChange value={history.changePct} />}
            <span className="text-xs text-gt-muted-2">{range} available history</span>
          </div>
          <div className="h-64 w-full sm:h-80" role="img" aria-label={history.changePct === null
            ? `GTREE price chart in ${quote} over ${range}; percentage change unavailable`
            : `GTREE price chart in ${quote} over ${range}, ${history.changePct >= 0 ? "up" : "down"} ${Math.abs(history.changePct).toFixed(2)} percent`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={history.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--gt-emerald-bright)" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="var(--gt-emerald-bright)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(ts) => formatMarketAxisTime(ts, range)}
                  stroke="var(--gt-border)"
                  tick={{ fill: "var(--gt-muted-2)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={40}
                />
                <YAxis yAxisId="volume" hide domain={[0, (max: number) => max * 4]} />
                <YAxis
                  yAxisId="price"
                  orientation="right"
                  tick={{ fill: "var(--gt-muted-2)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => (quote === "USD" ? formatUsd(v, { decimals: 4 }) : v.toFixed(7))}
                />
                <Tooltip content={<ChartTooltip quote={quote} range={range} />} cursor={{ stroke: "var(--gt-moss)", strokeDasharray: "4 4" }} />
                <Bar yAxisId="volume" dataKey="volume" fill="var(--gt-surface-3)" radius={[2, 2, 0, 0]} barSize={3} />
                <Area
                  yAxisId="price"
                  type="monotone"
                  dataKey="price"
                  stroke="var(--gt-emerald-bright)"
                  strokeWidth={2}
                  fill="url(#priceFill)"
                  dot={false}
                  activeDot={{ r: 4, fill: "var(--gt-emerald-bright)", stroke: "var(--gt-black)", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-gt-muted-2">
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-gt-emerald-bright" /> GTREE spot price</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2 bg-gt-surface-3" /> Meteora swap volume</span>
            {history.availableFrom && <span className="ml-auto">History available since {formatMarketDate(history.availableFrom)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
