"use client";

import * as React from "react";
import type { DataResult } from "@/types/data";
import type { FoundationInventorySnapshot, MarketSnapshot } from "@/types/market";
import {
  markMarketSnapshotStale,
  normalizeMarketSnapshotEnvelope,
} from "@/lib/market/price-snapshot";

export const SHARED_SNAPSHOT_REFRESH_MS = 20_000;
const RETRY_BACKOFF_INITIAL_MS = 5_000;
const RETRY_BACKOFF_MAX_MS = 120_000;

export interface SharedSnapshotState<T> {
  value: T | null;
  loading: boolean;
  error: string | null;
  receivedAt: number;
}

type FetchSnapshot<T> = (signal: AbortSignal) => Promise<T>;
type MarkRefreshFailure<T> = (previous: T, error: string) => T;

export class SharedClientSnapshot<T> {
  private state: SharedSnapshotState<T> = { value: null, loading: false, error: null, receivedAt: 0 };
  private readonly serverState: SharedSnapshotState<T> = { value: null, loading: false, error: null, receivedAt: 0 };
  private listeners = new Set<() => void>();
  private request: Promise<T | null> | null = null;
  private controller: AbortController | null = null;
  private interval: number | null = null;
  private retryAfter = 0;
  private consecutiveFailures = 0;

  constructor(
    private readonly fetchSnapshot: FetchSnapshot<T>,
    private readonly refreshMs = SHARED_SNAPSHOT_REFRESH_MS,
    private readonly now: () => number = Date.now,
    private readonly markRefreshFailure?: MarkRefreshFailure<T>,
  ) {}

  getSnapshot = () => this.state;
  getServerSnapshot = () => this.serverState;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    void this.refreshIfStale();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  };

  seed(value: T) {
    if (this.state.value !== null) return;
    this.state = { value, loading: false, error: null, receivedAt: this.now() };
  }

  isStale() {
    return this.state.receivedAt === 0 || this.now() - this.state.receivedAt >= this.refreshMs;
  }

  refreshIfStale() {
    if (typeof document !== "undefined" && document.hidden) return Promise.resolve(this.state.value);
    if (this.now() < this.retryAfter) return Promise.resolve(this.state.value);
    return this.isStale() ? this.refresh() : Promise.resolve(this.state.value);
  }

  refresh(options: { force?: boolean } = {}): Promise<T | null> {
    if (this.request) return this.request;
    if (!options.force && this.now() < this.retryAfter) return Promise.resolve(this.state.value);
    if (!options.force && typeof document !== "undefined" && document.hidden) return Promise.resolve(this.state.value);
    this.controller = new AbortController();
    this.state = { ...this.state, loading: true, error: null };
    this.emit();

    this.request = this.fetchSnapshot(this.controller.signal)
      .then((value) => {
        this.state = { value, loading: false, error: null, receivedAt: this.now() };
        this.retryAfter = 0;
        this.consecutiveFailures = 0;
        this.emit();
        return value;
      })
      .catch((error: unknown) => {
        if (!this.controller?.signal.aborted) {
          const message = error instanceof Error ? error.message : "Snapshot refresh failed.";
          this.state = {
            ...this.state,
            value: this.state.value !== null && this.markRefreshFailure
              ? this.markRefreshFailure(this.state.value, message)
              : this.state.value,
            loading: false,
            error: message,
          };
          this.consecutiveFailures += 1;
          this.retryAfter = this.now() + Math.min(
            RETRY_BACKOFF_INITIAL_MS * 2 ** (this.consecutiveFailures - 1),
            RETRY_BACKOFF_MAX_MS,
          );
          this.emit();
        }
        return this.state.value as T;
      })
      .finally(() => {
        this.request = null;
        this.controller = null;
      });
    return this.request;
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  private start() {
    if (typeof window === "undefined") return;
    this.interval = window.setInterval(() => {
      if (!document.hidden) void this.refreshIfStale();
    }, this.refreshMs);
    window.addEventListener("focus", this.handleFocus);
    document.addEventListener("visibilitychange", this.handleVisibility);
  }

  private stop() {
    if (this.interval !== null) window.clearInterval(this.interval);
    this.interval = null;
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", this.handleFocus);
      document.removeEventListener("visibilitychange", this.handleVisibility);
    }
  }

  private handleFocus = () => {
    void this.refreshIfStale();
  };

  private handleVisibility = () => {
    if (!document.hidden) void this.refreshIfStale();
  };
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body && typeof body.error === "string" ? body.error : "Snapshot refresh failed.");
  }
  return body as T;
}

function logSnapshotDiagnostic(category: "accepted" | "rejected", body: unknown) {
  if (process.env.NODE_ENV !== "development") return;
  const envelope = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const data = envelope?.data && typeof envelope.data === "object"
    ? envelope.data as Record<string, unknown>
    : null;
  console.info(JSON.stringify({
    event: "market_snapshot_client_boundary",
    category,
    endpoint: "/api/market/snapshot",
    status: typeof envelope?.status === "string" ? envelope.status : "invalid",
    sourceStatus: typeof data?.sourceStatus === "string" ? data.sourceStatus : "invalid",
    hasData: Boolean(data),
    fieldTypes: {
      solUsd: typeof data?.solUsd,
      gtreeUsd: typeof data?.gtreeUsd,
      referenceGtreePerSol: typeof data?.referenceGtreePerSol,
      effectiveGtreePerSol: typeof data?.effectiveGtreePerSol,
    },
    reason: category === "rejected" ? "contract_validation_failed" : undefined,
  }));
}

const marketSnapshot = new SharedClientSnapshot<DataResult<MarketSnapshot>>(
  async (signal) => {
    const body = await fetchJson<unknown>("/api/market/snapshot", signal);
    try {
      const result = normalizeMarketSnapshotEnvelope(body);
      logSnapshotDiagnostic("accepted", body);
      return result;
    } catch (error) {
      logSnapshotDiagnostic("rejected", body);
      throw error;
    }
  },
  SHARED_SNAPSHOT_REFRESH_MS,
  Date.now,
  (previous, error) => markMarketSnapshotStale(previous, error),
);
const foundationInventory = new SharedClientSnapshot<FoundationInventorySnapshot>(
  (signal) => fetchJson("/api/foundation/inventory", signal),
);

export function useSharedMarketSnapshot() {
  return React.useSyncExternalStore(
    marketSnapshot.subscribe,
    marketSnapshot.getSnapshot,
    marketSnapshot.getServerSnapshot,
  );
}

export function useSharedFoundationInventory() {
  const state = React.useSyncExternalStore(
    foundationInventory.subscribe,
    foundationInventory.getSnapshot,
    foundationInventory.getServerSnapshot,
  );
  return { ...state, refresh: () => foundationInventory.refresh({ force: true }) };
}
