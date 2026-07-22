import { ExternalLink } from "lucide-react";
import { CopyButton } from "@/components/shared/copy-button";
import { getFoundationTransactions } from "@/lib/admin/operations-data";
import { ENV } from "@/lib/constants/env";
import { explorerTxUrl } from "@/lib/constants/project";
import { atomicToDecimal, formatDecimalAmount } from "@/lib/market/amounts";
import { formatCompactDecimal } from "@/lib/market/buy-input";

interface FoundationActivityCardProps {
  limit?: number;
  expanded?: boolean;
}

export function FoundationActivityCard({ limit = 3, expanded = false }: FoundationActivityCardProps) {
  const result = getFoundationTransactions({
    view: "CONFIRMED",
    page: 1,
    pageSize: limit,
  });

  return (
    <section className={`glass-surface-b min-w-0 overflow-hidden rounded-lg ${expanded ? "p-5 sm:p-6" : "h-[220px] max-h-[220px] p-3"}`}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-gt-fg">Live Foundation Activity</h3>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p className="min-w-0 truncate text-[11px] text-gt-muted">
            Confirmed direct purchases from the Foundation sale ledger.
          </p>
          <span className="shrink-0 text-[10px] font-medium text-gt-muted">Latest {limit} confirmed purchases</span>
        </div>
      </div>

      {!result.available ? (
        <p className="mt-5 text-xs text-gt-muted">Foundation sale ledger unavailable.</p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-3 divide-x divide-gt-border-soft border-y border-gt-border-soft py-1.5">
            <Metric
              label="Confirmed SOL"
              raw={atomicToDecimal(result.summary.confirmedInputLamports, 9)}
              suffix="SOL"
              maximumFractionDigits={4}
            />
            <Metric
              label="Confirmed GTREE"
              raw={atomicToDecimal(result.summary.confirmedOutputTokenUnits, 9)}
              suffix="GTREE"
            />
            <Metric
              label="Unique buyers"
              raw={String(result.summary.uniqueConfirmedBuyers)}
            />
          </div>

          {result.items.length === 0 ? (
            <p className="mt-5 text-center text-xs text-gt-muted">
              No confirmed Foundation purchases yet.
            </p>
          ) : (
            <div className="mt-1 divide-y divide-gt-border-soft">
              <div
                aria-hidden="true"
                className="hidden min-w-0 grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_90px_minmax(0,0.8fr)_24px] gap-2 pb-1 text-[9px] uppercase tracking-wide text-gt-muted lg:grid"
              >
                <span>Buyer</span>
                <span>SOL paid</span>
                <span>GTREE received</span>
                <span>Status</span>
                <span className="text-right">Time</span>
                <span className="sr-only">Action</span>
              </div>
              {result.items.slice(0, limit).map((item) => {
                const sol = atomicToDecimal(item.inputLamports, 9);
                const gtree = atomicToDecimal(item.outputTokenUnits, 9);
                return (
                  <div
                    key={item.quoteId}
                    className="grid min-w-0 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] grid-rows-2 items-center gap-x-2 gap-y-1 py-1.5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_90px_minmax(0,0.8fr)_24px] lg:grid-rows-1 lg:gap-2 lg:py-1"
                  >
                    <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-1 lg:col-auto lg:row-auto">
                      <span className="truncate font-mono text-[11px] font-medium text-gt-fg" title={item.buyer}>
                        {shorten(item.buyer)}
                      </span>
                      <CopyButton value={item.buyer} label="Copy full buyer wallet" iconOnly className="shrink-0 p-0.5" />
                    </div>

                    <p className="col-start-1 row-start-2 min-w-0 truncate whitespace-nowrap text-[10px] tabular-nums text-gt-fg lg:col-auto lg:row-auto" title={`${sol} SOL`}>
                      {formatDecimalAmount(sol, 4)} <span className="text-gt-muted">SOL</span>
                    </p>

                    <p className="col-start-2 row-start-2 min-w-0 truncate whitespace-nowrap text-[10px] tabular-nums text-gt-fg lg:col-auto lg:row-auto" title={`${gtree} GTREE`}>
                      {formatDecimalAmount(gtree, 3)} <span className="text-gt-muted">GTREE</span>
                    </p>

                    <span className="col-start-2 row-start-1 justify-self-start whitespace-nowrap rounded border border-gt-emerald/30 px-1 py-0.5 text-[9px] font-semibold uppercase text-gt-emerald-bright lg:col-auto lg:row-auto">
                      Confirmed
                    </span>

                    <time
                      dateTime={new Date(item.confirmedAt ?? item.createdAt).toISOString()}
                      className="col-start-3 row-start-2 justify-self-end whitespace-nowrap text-right text-[10px] tabular-nums text-gt-muted lg:col-auto lg:row-auto"
                    >
                      {formatConfirmedTime(item.confirmedAt ?? item.createdAt)}
                    </time>

                    <div className="col-start-3 row-start-1 justify-self-end lg:col-auto lg:row-auto">
                      {item.signature ? (
                        <a
                          href={explorerTxUrl(ENV.solscanBaseUrl, item.signature)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Open confirmed transaction on Solscan"
                          className="inline-flex p-0.5 text-gt-emerald-bright hover:text-gt-offwhite"
                        >
                          <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : <span className="text-gt-muted" aria-label="No transaction signature">—</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Metric({
  label,
  raw,
  suffix,
  maximumFractionDigits = 2,
}: {
  label: string;
  raw: string;
  suffix?: string;
  maximumFractionDigits?: number;
}) {
  const exact = `${formatDecimalAmount(raw, 9)}${suffix ? ` ${suffix}` : ""}`;
  const display = `${formatCompactDecimal(raw, maximumFractionDigits)}${suffix ? ` ${suffix}` : ""}`;
  return (
    <div className="min-w-0 px-2 first:pl-0 last:pr-0" title={exact}>
      <p className="truncate text-[9px] uppercase tracking-wide text-gt-muted">{label}</p>
      <p className="truncate text-xs font-semibold text-gt-fg">{display}</p>
    </div>
  );
}

function shorten(value: string) {
  return value.length <= 14 ? value : `${value.slice(0, 6)}…${value.slice(-6)}`;
}

function formatConfirmedTime(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
