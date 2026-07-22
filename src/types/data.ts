import type { DataSourceKey } from "@/config/data-sources";

export type DataSourceStatus =
  | "ready"
  | "stale"
  | "unavailable"
  | "configuration-error"
  | "source-error";

export interface DataResult<T> {
  data: T | null;
  source: DataSourceKey;
  fetchedAt: string | null;
  status: DataSourceStatus;
  stale: boolean;
  error: string | null;
  network: "solana-mainnet" | "project-static";
}

export function readyData<T>(
  data: T,
  source: DataSourceKey,
  network: DataResult<T>["network"] = "solana-mainnet",
  fetchedAt = new Date().toISOString(),
): DataResult<T> {
  return {
    data,
    source,
    fetchedAt,
    status: "ready",
    stale: false,
    error: null,
    network,
  };
}

export function unavailableData<T>(
  source: DataSourceKey,
  error: string,
  status: Extract<DataSourceStatus, "unavailable" | "configuration-error" | "source-error"> = "source-error",
  network: DataResult<T>["network"] = "solana-mainnet",
): DataResult<T> {
  return {
    data: null,
    source,
    fetchedAt: null,
    status,
    stale: false,
    error,
    network,
  };
}
