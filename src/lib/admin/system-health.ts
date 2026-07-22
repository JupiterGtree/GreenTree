import "server-only";

import { access, constants, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PublicKey } from "@solana/web3.js";
import { SERVER_ENV } from "@/config/server-env";
import { GTREE_POOL_ADDRESS, WRAPPED_SOL_MINT } from "@/lib/constants/env";
import { PROJECT } from "@/lib/constants/project";
import { getSharedReferenceCacheStatus } from "@/lib/purchase/foundation-reference-price";
import { ExternalRequestError, fetchJson } from "@/services/http/fetch-json";
import { fetchMeteoraPool } from "@/services/meteora/pool";
import { getFoundationQuoteSummary } from "./operations-data";
import { resolveRuntimeSetting } from "./runtime-settings";

// @ts-expect-error node:sqlite is available in Node 22.5+, ahead of configured Node 20 types.
import { DatabaseSync } from "node:sqlite";

export type HealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN";

export interface HealthCheck {
  key: "rpc" | "jupiter" | "meteora" | "foundationSqlite" | "adminSqlite" | "dataDirectory"
    | "config" | "runtime" | "lastQuote" | "lastSettlement" | "referenceCache";
  label: string;
  status: HealthStatus;
  detail: string;
  latencyMs: number | null;
  checkedAt: number;
  retryable: boolean;
}

export interface HealthCheckDefinition {
  key: HealthCheck["key"];
  label: string;
  run: () => HealthCheck | Promise<HealthCheck>;
}

const TIMEOUT_MS = 4_000;
const METEORA_TIMEOUT_MS = 6_000;

export async function getSystemHealth(): Promise<{ checkedAt: number; checks: HealthCheck[] }> {
  try {
    return await collectSystemHealth();
  } catch {
    logUnexpectedHealthFailure("system-health-boundary");
    const checkedAt = Date.now();
    return {
      checkedAt,
      checks: [{
        key: "config",
        label: "System health",
        status: "UNKNOWN",
        detail: "System health data could not be fully collected.",
        latencyMs: null,
        checkedAt,
        retryable: true,
      }],
    };
  }
}

async function collectSystemHealth(): Promise<{ checkedAt: number; checks: HealthCheck[] }> {
  let foundation: ReturnType<typeof getFoundationQuoteSummary> | null = null;
  try {
    foundation = getFoundationQuoteSummary();
  } catch {
    logUnexpectedHealthFailure("foundation-summary");
  }

  const definitions: HealthCheckDefinition[] = [
    { key: "rpc", label: "Solana RPC", run: rpcCheck },
    { key: "jupiter", label: "Jupiter", run: jupiterCheck },
    { key: "meteora", label: "Meteora", run: meteoraCheck },
    { key: "foundationSqlite", label: "Foundation SQLite", run: () =>
      sqliteCheck("foundationSqlite", "Foundation SQLite", resolve(process.cwd(), "data", "foundation-sale.db"), "quotes") },
    { key: "adminSqlite", label: "Admin SQLite", run: () =>
      sqliteCheck("adminSqlite", "Admin SQLite", process.env.ADMIN_DB_PATH || resolve(process.cwd(), "data", "admin.db"), "admin_users") },
    { key: "dataDirectory", label: "Data directory", run: dataDirectoryCheck },
    { key: "config", label: "Runtime config", run: configCheck },
    { key: "runtime", label: "Purchase runtime", run: runtimeCheck },
    { key: "lastQuote", label: "Last successful quote", run: () => foundationActivityCheck(
      "lastQuote", "Last successful quote", foundation,
      foundation?.available ? foundation.latestQuote?.createdAt ?? null : null,
    ) },
    { key: "lastSettlement", label: "Last settlement", run: () => foundationActivityCheck(
      "lastSettlement", "Last settlement", foundation,
      foundation?.available ? foundation.latestConfirmed?.confirmedAt ?? null : null,
    ) },
    { key: "referenceCache", label: "Validated reference cache", run: referenceCacheCheck },
  ];

  const checks = await settleHealthChecks(definitions);
  return { checkedAt: Date.now(), checks };
}

export async function settleHealthChecks(definitions: HealthCheckDefinition[]): Promise<HealthCheck[]> {
  const completed = new Map<HealthCheck["key"], HealthCheck>();
  try {
    const settled = await Promise.allSettled(definitions.map(({ key, label, run }) =>
      safeHealthCheck(key, label, run).then((result) => {
        completed.set(key, result);
        return result;
      })));
    return settled.map((result, index) => result.status === "fulfilled"
      ? result.value
      : completed.get(definitions[index].key)
        ?? fallbackCheck(definitions[index].key, definitions[index].label));
  } catch {
    logUnexpectedHealthFailure("system-health");
    return definitions.map(({ key, label }) => completed.get(key) ?? fallbackCheck(key, label));
  }
}

export async function rpcCheck(): Promise<HealthCheck> {
  const started = Date.now();
  try {
    const body = await fetchJson<{ result?: unknown }>(SERVER_ENV.solanaRpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
    }, { source: "Solana RPC health", timeoutMs: TIMEOUT_MS, failureLog: "warn" });
    const healthy = body !== null && typeof body === "object" && body.result === "ok";
    return check("rpc", "Solana RPC", healthy ? "HEALTHY" : "DEGRADED",
      healthy ? "Read-only health request succeeded." : "Endpoint responded without a healthy result.", started);
  } catch (error) {
    return externalFailureCheck("rpc", "Solana RPC", error, started,
      "Read-only health request is unavailable.", "Endpoint returned an unusable health response.");
  }
}

export async function jupiterCheck(): Promise<HealthCheck> {
  const started = Date.now();
  try {
    const url = new URL(`${SERVER_ENV.jupiterApiBaseUrl}/quote`);
    url.searchParams.set("inputMint", WRAPPED_SOL_MINT);
    url.searchParams.set("outputMint", PROJECT.mint);
    url.searchParams.set("amount", "1000000");
    url.searchParams.set("slippageBps", "50");
    const body = await fetchJson<Record<string, unknown>>(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        ...(SERVER_ENV.jupiterApiKey ? { "x-api-key": SERVER_ENV.jupiterApiKey } : {}),
      },
    }, { source: "Jupiter health", timeoutMs: TIMEOUT_MS, failureLog: "warn" });
    const usable = body !== null
      && typeof body === "object"
      && body.inputMint === WRAPPED_SOL_MINT
      && body.outputMint === PROJECT.mint
      && typeof body.inAmount === "string"
      && typeof body.outAmount === "string"
      && /^\d+$/.test(body.outAmount) && BigInt(body.outAmount) > 0n
      && Array.isArray(body.routePlan)
      && body.routePlan.length > 0;
    return check("jupiter", "Jupiter", usable ? "HEALTHY" : "DEGRADED",
      usable ? "Validated a usable read-only GTREE route response." : "Response was not a usable GTREE route quote.", started);
  } catch (error) {
    return externalFailureCheck("jupiter", "Jupiter", error, started,
      "Read-only route validation is unavailable.", "Endpoint returned an unusable route response.");
  }
}

export async function meteoraCheck(): Promise<HealthCheck> {
  const started = Date.now();
  try {
    const pool = await fetchMeteoraPool({ timeoutMs: METEORA_TIMEOUT_MS, retries: 0, failureLog: "warn" });
    const usable = pool.address === GTREE_POOL_ADDRESS
      && Number.isFinite(pool.currentPriceSol) && pool.currentPriceSol > 0
      && Number.isFinite(pool.solPriceUsd) && pool.solPriceUsd > 0;
    return check("meteora", "Meteora", usable ? "HEALTHY" : "DEGRADED",
      usable ? "Validated the configured GTREE-SOL pool identity and prices." : "Pool response was not usable.", started);
  } catch (error) {
    return externalFailureCheck("meteora", "Meteora", error, started,
      "Validated pool request is unavailable.", "Pool endpoint returned an unusable response.");
  }
}

async function sqliteCheck(
  key: "foundationSqlite" | "adminSqlite",
  label: string,
  path: string,
  requiredTable: string,
): Promise<HealthCheck> {
  const started = Date.now();
  if (!existsSync(path)) return check(key, label, "UNAVAILABLE", "Database source is missing.", started);
  let database: InstanceType<typeof DatabaseSync> | undefined;
  try {
    database = new DatabaseSync(path, { readOnly: true });
    database.exec("PRAGMA query_only = ON; PRAGMA busy_timeout = 1500;");
    const integrity = database.prepare("PRAGMA quick_check(1)").get() as { quick_check?: string };
    const journal = database.prepare("PRAGMA journal_mode").get() as Record<string, unknown>;
    const timeout = database.prepare("PRAGMA busy_timeout").get() as Record<string, unknown>;
    const table = database.prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(requiredTable);
    if (integrity.quick_check !== "ok" || !table) {
      return check(key, label, "DEGRADED", "Database opened but failed schema or integrity checks.", started);
    }
    const journalMode = String(journal.journal_mode ?? "unknown");
    const busyTimeoutMs = Number(timeout.timeout ?? timeout.busy_timeout);
    return check(key, label, "HEALTHY",
      `Read-only integrity passed; journal=${journalMode}; check busy_timeout=${Number.isFinite(busyTimeoutMs) ? busyTimeoutMs : "Unknown"} ms.`,
      started);
  } catch {
    return check(key, label, "UNAVAILABLE", "Database could not be opened read-only.", started);
  } finally {
    try { database?.close(); } catch { /* Ignore close errors after a failed check. */ }
  }
}

async function runtimeCheck(): Promise<HealthCheck> {
  const started = Date.now();
  try {
    const mode = String(resolveRuntimeSetting("purchaseMode"));
    const emergencyPaused = Boolean(resolveRuntimeSetting("emergencyPaused"));
    return check("runtime", "Purchase runtime", "HEALTHY",
      `Mode=${mode}; emergency pause=${emergencyPaused ? "enabled" : "disabled"}.`, started);
  } catch {
    return check("runtime", "Purchase runtime", "UNAVAILABLE", "Runtime controls could not be resolved.", started);
  }
}

function foundationActivityCheck(
  key: "lastQuote" | "lastSettlement",
  label: string,
  source: ReturnType<typeof getFoundationQuoteSummary> | null,
  timestamp: number | null,
): HealthCheck {
  const started = Date.now();
  if (!source?.available) return check(key, label, "UNAVAILABLE", "Foundation SQLite is unavailable.", started);
  return check(key, label, "HEALTHY",
    timestamp === null ? "No record has been stored." : `Last recorded at ${new Date(timestamp).toISOString()}.`,
    started);
}

function referenceCacheCheck(): HealthCheck {
  const started = Date.now();
  const status = getSharedReferenceCacheStatus();
  return check("referenceCache", "Validated reference cache", "HEALTHY",
    status.state === "active"
      ? `Active entry age=${status.ageMs} ms; remaining TTL=${status.remainingMs} ms.`
      : "No active in-process validated reference entry.",
    started);
}

async function dataDirectoryCheck(): Promise<HealthCheck> {
  const started = Date.now();
  const directory = resolve(process.cwd(), "data");
  try {
    if (!(await stat(directory)).isDirectory()) {
      return check("dataDirectory", "Data directory", "UNAVAILABLE", "Configured path is not a directory.", started);
    }
    await access(directory, constants.R_OK | constants.W_OK);
    return check("dataDirectory", "Data directory", "HEALTHY", "Directory is readable and writable.", started);
  } catch {
    return check("dataDirectory", "Data directory", "UNAVAILABLE", "Directory is missing or inaccessible.", started);
  }
}

async function configCheck(): Promise<HealthCheck> {
  const started = Date.now();
  try {
    new PublicKey(PROJECT.mint);
    const mode = resolveRuntimeSetting("purchaseMode");
    if (mode === "FOUNDATION_DIRECT") {
      for (const name of [
        "FOUNDATION_DIRECT_TREASURY_RECIPIENT",
        "FOUNDATION_DIRECT_GTREE_MINT",
        "FOUNDATION_DIRECT_SALE_TOKEN_ACCOUNT",
        "FOUNDATION_DIRECT_SALE_SIGNER_PUBLIC_KEY",
      ]) {
        const value = process.env[name]?.trim();
        if (!value) return check("config", "Runtime config", "DEGRADED", "A required public address is not configured.", started);
        new PublicKey(value);
      }
    }
    return check("config", "Runtime config", "HEALTHY", "Approved non-secret settings and public addresses are valid.", started);
  } catch {
    return check("config", "Runtime config", "DEGRADED", "An approved setting or public address is invalid.", started);
  }
}

async function safeHealthCheck(
  key: HealthCheck["key"],
  label: string,
  run: () => HealthCheck | Promise<HealthCheck>,
): Promise<HealthCheck> {
  try {
    return await run();
  } catch {
    logUnexpectedHealthFailure(key);
    return fallbackCheck(key, label);
  }
}

function fallbackCheck(key: HealthCheck["key"], label: string): HealthCheck {
  return {
    key,
    label,
    status: "UNKNOWN",
    detail: "The diagnostic could not complete safely.",
    latencyMs: null,
    checkedAt: Date.now(),
    retryable: true,
  };
}

function externalFailureCheck(
  key: "rpc" | "jupiter" | "meteora",
  label: string,
  error: unknown,
  started: number,
  unavailableDetail: string,
  degradedDetail: string,
): HealthCheck {
  const degraded = error instanceof ExternalRequestError
    ? error.outcome === "HTTP error" || error.outcome === "invalid"
    : true;
  if (!(error instanceof ExternalRequestError)) warnHealthFailure(key, "invalid");
  return check(key, label, degraded ? "DEGRADED" : "UNAVAILABLE",
    degraded ? degradedDetail : unavailableDetail, started, true);
}

function warnHealthFailure(checkKey: string, outcome: "invalid"): void {
  console.warn(JSON.stringify({
    event: "admin_health_check_failed",
    check: checkKey,
    outcome,
  }));
}

function logUnexpectedHealthFailure(checkKey: string): void {
  console.error(JSON.stringify({
    event: "admin_health_check_unexpected_failure",
    check: checkKey,
  }));
}

function check(
  key: HealthCheck["key"],
  label: string,
  status: HealthStatus,
  detail: string,
  started: number,
  retryable = false,
): HealthCheck {
  return {
    key,
    label,
    status,
    detail,
    latencyMs: Date.now() - started,
    checkedAt: Date.now(),
    retryable,
  };
}
