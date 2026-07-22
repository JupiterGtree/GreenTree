"use client";

import * as React from "react";
import { ArrowUpRight, ShieldCheck, Target } from "lucide-react";
import { formatDecimalAmount } from "@/lib/market/amounts";

interface FoundationSaleProgressVisualProps {
  status: "live" | "unavailable";
  fill?: boolean;
  targetGtree?: string;
  confirmedGtree?: string;
  remainingGtree?: string;
  confirmedSol?: string;
  availableInventoryGtree?: string;
  progressPercent?: number;
  progressLabel?: string;
}

export function FoundationSaleProgressVisual(props: FoundationSaleProgressVisualProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (props.status === "unavailable") {
    return (
      <section className={`surface-card rounded-lg px-5 py-6 sm:px-6 ${props.fill ? "lg:h-full" : ""}`} aria-labelledby="foundation-sale-progress-title">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gt-emerald-bright">Foundation allocation</p>
        <h2 id="foundation-sale-progress-title" className="mt-2 text-xl font-semibold text-gt-fg">Foundation sale progress</h2>
        <p className="mt-2 text-sm text-gt-muted">Foundation inventory data is temporarily unavailable.</p>
      </section>
    );
  }

  const progressPercent = Math.min(Math.max(props.progressPercent ?? 0, 0), 100);
  const hasConfirmedSales = progressPercent > 0;

  return (
    <section className={`surface-card relative overflow-hidden rounded-lg px-5 py-6 sm:px-6 ${props.fill ? "lg:h-full" : ""}`} aria-labelledby="foundation-sale-progress-title">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_12%,rgba(32,178,170,0.14),transparent_30%),linear-gradient(115deg,transparent,rgba(75,211,203,0.035))]" />
      <div className="relative">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gt-emerald-bright">Foundation allocation</p>
            <h2 id="foundation-sale-progress-title" className="mt-2 text-2xl font-semibold tracking-tight text-gt-fg sm:text-3xl">
              A measured release from Foundation inventory.
            </h2>
            <p className="mt-2 text-sm leading-6 text-gt-muted">
              The Foundation sale is capped by its configured allocation. Confirmed purchases are settled directly to the treasury and reflected here after ledger confirmation.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start border border-gt-emerald/25 bg-gt-emerald/8 px-3 py-2 text-xs text-gt-emerald-bright lg:self-auto">
            <ShieldCheck className="size-4" aria-hidden />
            Confirmed settlement data
          </div>
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(270px,0.35fr)] lg:items-end">
          <div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gt-muted">Allocation released</p>
                <p className="mt-1 tabular-nums text-3xl font-semibold text-gt-fg sm:text-4xl">{props.progressLabel}</p>
              </div>
              <p className="max-w-44 text-right text-xs leading-5 text-gt-muted">
                {formatDecimalAmount(props.confirmedGtree ?? "0", 6)} GTREE confirmed
              </p>
            </div>

            <div
              className="relative mt-4 h-3 overflow-hidden rounded-sm border border-gt-border bg-gt-charcoal/70"
              role="progressbar"
              aria-label="Foundation allocation released"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
              aria-valuetext={`${props.progressLabel} of the Foundation allocation released`}
            >
              <div className="absolute inset-y-0 left-1/4 w-px bg-gt-border-soft" />
              <div className="absolute inset-y-0 left-1/2 w-px bg-gt-border-soft" />
              <div className="absolute inset-y-0 left-3/4 w-px bg-gt-border-soft" />
              <div
                className="h-full min-w-px bg-gt-emerald shadow-[0_0_18px_rgba(32,178,170,0.45)] transition-[width] duration-1000 ease-out motion-reduce:transition-none"
                style={{ width: mounted ? `${progressPercent}%` : "0%" }}
              />
              {hasConfirmedSales && <span aria-hidden className="absolute left-0 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gt-emerald-bright shadow-[0_0_14px_rgba(75,211,203,0.85)]" />}
            </div>
            <div className="mt-2 grid grid-cols-4 text-[10px] tabular-nums text-gt-muted-2">
              <span>0%</span>
              <span className="text-center">25%</span>
              <span className="text-center">50%</span>
              <span className="text-right">100%</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-gt-border-soft pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <ProgressMetric label="Sale target" value={`${formatDecimalAmount(props.targetGtree ?? "0", 0)} GTREE`} icon={<Target className="size-3.5" aria-hidden />} />
            <ProgressMetric label="Allocation remaining" value={`${formatDecimalAmount(props.remainingGtree ?? "0", 3)} GTREE`} />
            <ProgressMetric label="Confirmed proceeds" value={`${formatDecimalAmount(props.confirmedSol ?? "0", 4)} SOL`} />
            <ProgressMetric label="Live sale inventory" value={`${formatDecimalAmount(props.availableInventoryGtree ?? "0", 3)} GTREE`} icon={<ArrowUpRight className="size-3.5" aria-hidden />} />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProgressMetric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-gt-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums text-gt-fg" title={value}>{value}</p>
    </div>
  );
}
