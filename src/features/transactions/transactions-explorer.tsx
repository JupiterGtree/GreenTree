"use client";

import * as React from "react";
import { Inbox, Loader2, RefreshCw } from "lucide-react";
import type { OnchainActivityRecord } from "@/types/transaction";
import { TransactionFilters, matchesFilter, type TransactionFilter } from "@/features/transactions/transaction-filters";
import { TransactionTable } from "@/features/transactions/transaction-table";
import { TransactionCardList } from "@/features/transactions/transaction-card";
import { EmptyState } from "@/components/shared/empty-state";
import { DataSourceBadge } from "@/components/shared/data-badges";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/shared/relative-time";
import { createActivityRequestGuard } from "@/lib/market/onchain-activity-client";
import { isDisplayableActivityRecord } from "@/lib/market/onchain-activity-client";

const REFRESH_INTERVAL_MS = 60_000;

interface ActivityApiResponse {
  records?: OnchainActivityRecord[];
  partialData?: boolean;
  fetchedAt?: string;
  error?: string;
  retryable?: boolean;
}

export function TransactionsExplorer({ limit }: { limit?: number }) {
  const [filter, setFilter] = React.useState<TransactionFilter>("all");
  const [records, setRecords] = React.useState<OnchainActivityRecord[]>([]);
  const [partialData, setPartialData] = React.useState(false);
  const [fetchedAt, setFetchedAt] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [updating, setUpdating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestController = React.useRef<AbortController | null>(null);
  const requestCount = React.useRef(0);
  const hasRecordsRef = React.useRef(false);
  const refreshGuard = React.useRef(createActivityRequestGuard());

  const loadActivity = React.useCallback(async (mode: "initial" | "refresh" = "refresh") => {
    return refreshGuard.current.run(async () => {
      requestController.current?.abort();
      const controller = new AbortController();
      requestController.current = controller;
      const requestId = ++requestCount.current;

      if (mode === "initial" && !hasRecordsRef.current) setLoading(true);
      else setUpdating(true);

      try {
        const response = await fetch("/api/market/onchain-activity", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as ActivityApiResponse;
        if (requestId !== requestCount.current || controller.signal.aborted) return false;
        if (!response.ok) {
          setError(payload.error || "Unable to load Solana activity. Retry.");
          return false;
        }
        const nextRecords = Array.isArray(payload.records)
          ? payload.records.filter((tx) => isDisplayableActivityRecord(tx))
          : [];
        hasRecordsRef.current = nextRecords.length > 0;
        setRecords(nextRecords);
        setPartialData(Boolean(payload.partialData));
        setFetchedAt(payload.fetchedAt ?? new Date().toISOString());
        setError(null);
        return true;
      } catch (loadError) {
        if (controller.signal.aborted || requestId !== requestCount.current) return false;
        setError(loadError instanceof Error ? loadError.message : "Unable to load Solana activity. Retry.");
        return false;
      } finally {
        if (requestId === requestCount.current) {
          setLoading(false);
          setUpdating(false);
        }
      }
    });
  }, []);

  React.useEffect(() => {
    void loadActivity("initial");
    return () => requestController.current?.abort();
  }, [loadActivity]);

  React.useEffect(() => {
    let timer: number | null = null;

    const schedule = () => {
      if (timer !== null) window.clearInterval(timer);
      timer = window.setInterval(() => {
        if (document.visibilityState === "hidden") return;
        void loadActivity("refresh");
      }, REFRESH_INTERVAL_MS);
    };

    schedule();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadActivity("refresh");
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadActivity]);

  const filtered = React.useMemo(() => {
    const result = records
      .filter((tx) => isDisplayableActivityRecord(tx))
      .filter((tx) => matchesFilter(tx.type, filter));
    return limit ? result.slice(0, limit) : result;
  }, [records, filter, limit]);

  const hasRecords = records.some((tx) => isDisplayableActivityRecord(tx));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TransactionFilters value={filter} onChange={setFilter} />
        <div className="flex flex-wrap items-center gap-3">
          {updating && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gt-muted">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Updating…
            </span>
          )}
          {fetchedAt && (
            <span className="text-xs text-gt-muted-2">
              Updated <RelativeTime iso={fetchedAt} />
            </span>
          )}
          <button
            type="button"
            onClick={() => void loadActivity("refresh")}
            disabled={updating || loading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gt-emerald-bright hover:text-gt-offwhite disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${updating ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
          {hasRecords || !error ? (
            <DataSourceBadge mode="live" source="Solana RPC · Foundation treasury and sale inventory" />
          ) : (
            <span className="text-xs text-gt-muted">Solana RPC · unavailable</span>
          )}
        </div>
      </div>

      {partialData && hasRecords && (
        <p role="status" className="text-xs text-gt-warning">
          Some recent on-chain activity may be temporarily unavailable.
        </p>
      )}

      {loading && !hasRecords ? (
        <p className="text-sm text-gt-muted">Loading verified Solana activity…</p>
      ) : error && !hasRecords ? (
        <ErrorState title="Unable to load Solana activity" description={error}>
          <Button variant="outline" size="sm" onClick={() => void loadActivity("initial")}>
            Retry
          </Button>
        </ErrorState>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No recent verified Foundation activity was found."
          description="No confirmed treasury or sale-inventory activity matched the selected filter."
        />
      ) : (
        <>
          {error && hasRecords && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-gt-warning/30 bg-gt-warning/5 px-3 py-2 text-xs text-gt-warning">
              <span>{error}</span>
              <button type="button" className="font-semibold underline" onClick={() => void loadActivity("refresh")}>
                Retry
              </button>
            </div>
          )}
          <TransactionTable transactions={filtered} />
          <TransactionCardList transactions={filtered} />
        </>
      )}
    </div>
  );
}
