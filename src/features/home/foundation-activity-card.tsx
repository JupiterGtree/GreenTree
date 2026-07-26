"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/shared/copy-button";
import { ENV } from "@/lib/constants/env";
import { explorerTxUrl } from "@/lib/constants/project";
import { atomicToDecimal, formatDecimalAmount } from "@/lib/market/amounts";
import { formatCompactDecimal } from "@/lib/market/buy-input";

interface FoundationActivityCardProps {
  limit?: number;
  expanded?: boolean;
}

interface FoundationActivityRecord {
  buyer: string;
  inputLamports: string;
  outputTokenUnits: string;
  signature: string | null;
  confirmedAt: number;
}

interface FoundationActivitySummary {
  confirmedInputLamports: string;
  confirmedOutputTokenUnits: string;
  uniqueConfirmedBuyers: number;
}

interface FoundationActivityResponse {
  records?: FoundationActivityRecord[];
  summary?: FoundationActivitySummary;
  error?: string;
}

interface FoundationActivityState {
  available: boolean;
  records: FoundationActivityRecord[];
  summary: FoundationActivitySummary;
}

const EMPTY_SUMMARY: FoundationActivitySummary = {
  confirmedInputLamports: "0",
  confirmedOutputTokenUnits: "0",
  uniqueConfirmedBuyers: 0,
};

export function FoundationActivityCard({ limit = 3, expanded = false }: FoundationActivityCardProps) {
  const [activity, setActivity] = useState<FoundationActivityState>({
    available: true,
    records: [],
    summary: EMPTY_SUMMARY,
  });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch(`/api/foundation/activity?limit=${encodeURIComponent(String(limit))}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as FoundationActivityResponse;
        if (!active || !response.ok) return;
        setActivity(normalizeActivity(payload));
      } catch {
        // Keep the last rendered ledger view if a refresh races navigation.
      }
    };
    const onChanged = () => void refresh();
    window.addEventListener("gtree:foundation-activity-changed", onChanged);
    const interval = window.setInterval(() => void refresh(), 15_000);
    void refresh();
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener("gtree:foundation-activity-changed", onChanged);
      window.clearInterval(interval);
    };
  }, [limit]);

  const summary = useMemo(() => activity.summary, [activity.summary]);

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

      {!activity.available ? (
        <p className="mt-5 text-xs text-gt-muted">Foundation sale ledger unavailable.</p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-3 divide-x divide-gt-border-soft border-y border-gt-border-soft py-1.5">
            <Metric
              label="Confirmed SOL"
              raw={atomicToDecimal(summary.confirmedInputLamports, 9)}
              suffix="SOL"
              maximumFractionDigits={4}
            />
            <Metric
              label="Confirmed GTREE"
              raw={atomicToDecimal(summary.confirmedOutputTokenUnits, 9)}
              suffix="GTREE"
            />
            <Metric
              label="Unique buyers"
              raw={String(summary.uniqueConfirmedBuyers)}
            />
          </div>

          {activity.records.length === 0 ? (
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
              {activity.records.slice(0, limit).map((item) => {
                const sol = atomicToDecimal(item.inputLamports, 9);
                const gtree = atomicToDecimal(item.outputTokenUnits, 9);
                return (
                  <div
                    key={item.signature || `${item.buyer}-${item.confirmedAt}`}
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
                      dateTime={new Date(item.confirmedAt).toISOString()}
                      className="col-start-3 row-start-2 justify-self-end whitespace-nowrap text-right text-[10px] tabular-nums text-gt-muted lg:col-auto lg:row-auto"
                    >
                      {formatConfirmedTime(item.confirmedAt)}
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
    timeZone: "UTC",
  }).format(new Date(value));
}

function normalizeActivity(payload: FoundationActivityResponse): FoundationActivityState {
  return {
    available: !payload.error,
    records: Array.isArray(payload.records)
      ? payload.records.filter((record) =>
        typeof record.buyer === "string" &&
        typeof record.inputLamports === "string" &&
        typeof record.outputTokenUnits === "string" &&
        (typeof record.signature === "string" || record.signature === null) &&
        Number.isFinite(record.confirmedAt),
      )
      : [],
    summary: payload.summary && validSummary(payload.summary) ? payload.summary : EMPTY_SUMMARY,
  };
}

function validSummary(summary: FoundationActivitySummary) {
  return /^\d+$/.test(summary.confirmedInputLamports) &&
    /^\d+$/.test(summary.confirmedOutputTokenUnits) &&
    Number.isSafeInteger(summary.uniqueConfirmedBuyers) &&
    summary.uniqueConfirmedBuyers >= 0;
}
