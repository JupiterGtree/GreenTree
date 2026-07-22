import "server-only";

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ensureFoundationSaleLedger } from "@/lib/purchase/foundation-direct-db";

// @ts-expect-error node:sqlite is available in Node 22.5+, ahead of configured Node 20 types.
import { DatabaseSync } from "node:sqlite";

export type FoundationTransactionState =
  | "CREATED" | "BUILT" | "SUBMITTED" | "CONFIRMED" | "EXPIRED" | "FAILED";

export type FoundationTransactionView =
  | "SALES" | "CONFIRMED" | "PENDING" | "FAILED" | "EXPIRED" | "ALL";

export type FoundationValuationSource =
  | "CONFIRMATION" | "QUOTE" | "CURRENT_ESTIMATE" | "UNAVAILABLE";

export interface FoundationTransaction {
  quoteId: string;
  orderId: string | null;
  buyer: string;
  inputLamports: string;
  outputTokenUnits: string;
  state: FoundationTransactionState;
  signature: string | null;
  createdAt: number;
  expiresAt: number;
  submittedAt: number | null;
  confirmedAt: number | null;
  failedAt: number | null;
  failureReason: string | null;
  usdValue: string | null;
  solUsdPrice: string | null;
  valuationSource: FoundationValuationSource;
}

export interface TransactionFilters {
  view?: FoundationTransactionView;
  state?: FoundationTransactionState;
  query?: string;
  from?: number;
  to?: number;
  page?: number;
  pageSize?: number;
  currentSolUsd?: number | null;
}

export interface FoundationSalesSummary {
  confirmedCount: number;
  confirmedInputLamports: string;
  confirmedOutputTokenUnits: string;
  uniqueConfirmedBuyers: number;
  confirmedUsd: string | null;
  usdLabel: "Historical" | "Estimated" | "Unavailable";
  pendingCount: number;
  pendingInputLamports: string;
}

export type FoundationTransactionResult =
  | {
      available: true;
      items: FoundationTransaction[];
      total: number;
      page: number;
      pageSize: number;
      states: Record<FoundationTransactionState, number>;
      summary: FoundationSalesSummary;
    }
  | { available: false; reason: "Unavailable" };

const STATES: FoundationTransactionState[] = [
  "CREATED", "BUILT", "SUBMITTED", "CONFIRMED", "EXPIRED", "FAILED",
];

const VIEW_STATES: Record<FoundationTransactionView, FoundationTransactionState[]> = {
  SALES: ["SUBMITTED", "CONFIRMED"],
  CONFIRMED: ["CONFIRMED"],
  PENDING: ["SUBMITTED"],
  FAILED: ["FAILED"],
  EXPIRED: ["EXPIRED"],
  ALL: STATES,
};

export function getFoundationTransactions(
  filters: TransactionFilters = {},
  databasePath?: string,
): FoundationTransactionResult {
  const resolvedDatabasePath = databasePath ?? resolve(process.cwd(), "data", "foundation-sale.db");
  if (!databasePath && !existsSync(resolvedDatabasePath)) {
    try {
      ensureFoundationSaleLedger();
    } catch {
      return { available: false, reason: "Unavailable" };
    }
  }
  if (!existsSync(resolvedDatabasePath)) return { available: false, reason: "Unavailable" };
  let database: InstanceType<typeof DatabaseSync> | undefined;
  try {
    database = new DatabaseSync(resolvedDatabasePath, { readOnly: true });
    database.exec("PRAGMA query_only = ON; PRAGMA busy_timeout = 2000;");
    const table = database.prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'quotes'",
    ).get();
    if (!table) return { available: false, reason: "Unavailable" };

    const columns = new Set(
      (database.prepare("PRAGMA table_info(quotes)").all() as Array<{ name: string }>)
        .map((column) => column.name),
    );
    const required = ["quote_id", "buyer", "input_lamports", "output_token_units", "expires_at", "status", "created_at"];
    if (!required.every((column) => columns.has(column))) {
      return { available: false, reason: "Unavailable" };
    }

    const page = boundedInteger(filters.page, 1, 1, 100_000);
    const pageSize = boundedInteger(filters.pageSize, 25, 1, 100);
    const clauses: string[] = [];
    const values: Array<string | number> = [];
    if (filters.state) {
      clauses.push(filters.state === "BUILT" ? "status IN ('BUILT', 'CONSUMED')" : "status = ?");
      if (filters.state !== "BUILT") values.push(filters.state);
    } else {
      const view = filters.view ?? "ALL";
      const statuses = VIEW_STATES[view] ?? VIEW_STATES.SALES;
      const databaseStatuses = statuses.flatMap((state) => state === "BUILT" ? ["BUILT", "CONSUMED"] : [state]);
      clauses.push(`status IN (${databaseStatuses.map(() => "?").join(", ")})`);
      values.push(...databaseStatuses);
    }
    const query = filters.query?.trim().slice(0, 200);
    if (query) {
      const searchable = ["quote_id", "buyer", "tx_signature", "order_id"].filter((column) => columns.has(column));
      if (searchable.length) {
        clauses.push(`(${searchable.map((column) => `${column} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
        const like = `%${escapeLike(query)}%`;
        values.push(...searchable.map(() => like));
      }
    }
    if (Number.isSafeInteger(filters.from) && filters.from! >= 0) {
      clauses.push("created_at >= ?");
      values.push(filters.from!);
    }
    if (Number.isSafeInteger(filters.to) && filters.to! >= 0) {
      clauses.push("created_at <= ?");
      values.push(filters.to!);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const valuationColumns = findValuationColumns(columns);
    const select = [
      "quote_id", optionalColumn(columns, "order_id"), "buyer", "input_lamports",
      "output_token_units", "status", optionalColumn(columns, "tx_signature"),
      "created_at", "expires_at", optionalColumn(columns, "submitted_at"),
      optionalColumn(columns, "confirmed_at"), optionalColumn(columns, "failed_at"),
      optionalColumn(columns, "failure_reason"),
      valuationSelect(valuationColumns.confirmationUsd, "confirmation_usd"),
      valuationSelect(valuationColumns.confirmationSolUsd, "confirmation_sol_usd"),
      valuationSelect(valuationColumns.quoteUsd, "quote_usd"),
      valuationSelect(valuationColumns.quoteSolUsd, "quote_sol_usd"),
    ].join(", ");
    const total = Number((database.prepare(`SELECT COUNT(*) AS count FROM quotes ${where}`)
      .get(...values) as { count: number }).count);
    const rows = database.prepare(`
      SELECT ${select} FROM quotes ${where}
      ORDER BY created_at DESC, quote_id DESC LIMIT ? OFFSET ?
    `).all(...values, pageSize, (page - 1) * pageSize) as Array<Record<string, unknown>>;
    const stateRows = database.prepare(
      "SELECT status, COUNT(*) AS count FROM quotes GROUP BY status",
    ).all() as Array<{ status: string; count: number }>;
    const states = Object.fromEntries(STATES.map((state) => [state, 0])) as Record<FoundationTransactionState, number>;
    for (const row of stateRows) {
      const state = normalizeState(row.status);
      if (state) states[state] += Number(row.count);
    }
    const currentSolUsd = validCurrentPrice(filters.currentSolUsd);
    const items = rows.map((row) => mapTransaction(row, currentSolUsd));
    const confirmedRows = database.prepare(`
      SELECT input_lamports, output_token_units, buyer,
        ${valuationSelect(valuationColumns.confirmationUsd, "confirmation_usd")},
        ${valuationSelect(valuationColumns.confirmationSolUsd, "confirmation_sol_usd")},
        ${valuationSelect(valuationColumns.quoteUsd, "quote_usd")},
        ${valuationSelect(valuationColumns.quoteSolUsd, "quote_sol_usd")}
      FROM quotes WHERE status = 'CONFIRMED'
    `).all() as Array<Record<string, unknown>>;
    const pendingRows = database.prepare(
      "SELECT input_lamports FROM quotes WHERE status = 'SUBMITTED'",
    ).all() as Array<{ input_lamports: string }>;
    const summary = summarizeSales(confirmedRows, pendingRows, currentSolUsd);
    return { available: true, items, total, page, pageSize, states, summary };
  } catch {
    return { available: false, reason: "Unavailable" };
  } finally {
    try { database?.close(); } catch { /* The read-only source may already be closed. */ }
  }
}

export function getFoundationQuoteSummary(
  databasePath?: string,
): {
  available: true;
  total: number;
  states: Record<FoundationTransactionState, number>;
  inputLamports: string;
  outputTokenUnits: string;
  latestQuote: FoundationTransaction | null;
  latestSuccessfulQuote: FoundationTransaction | null;
  latestConfirmed: FoundationTransaction | null;
  latestFailed: FoundationTransaction | null;
}
  | { available: false; reason: "Unavailable" } {
  const resolvedDatabasePath = databasePath ?? resolve(process.cwd(), "data", "foundation-sale.db");
  const result = getFoundationTransactions({ view: "ALL", page: 1, pageSize: 1 }, databasePath);
  if (!result.available) return result;
  let database: InstanceType<typeof DatabaseSync> | undefined;
  try {
    database = new DatabaseSync(resolvedDatabasePath, { readOnly: true });
    database.exec("PRAGMA query_only = ON; PRAGMA busy_timeout = 2000;");
    const rows = database.prepare(
      "SELECT input_lamports, output_token_units FROM quotes WHERE status = 'CONFIRMED'",
    ).all() as Array<{ input_lamports: string; output_token_units: string }>;
    return {
      available: true,
      total: result.total,
      states: result.states,
      inputLamports: rows.reduce((sum, row) => sum + BigInt(row.input_lamports), 0n).toString(),
      outputTokenUnits: rows.reduce((sum, row) => sum + BigInt(row.output_token_units), 0n).toString(),
      latestQuote: result.items[0] ?? null,
      latestSuccessfulQuote: latestTransaction([
        getFoundationTransactions({ state: "CREATED", pageSize: 1 }, databasePath),
        getFoundationTransactions({ state: "BUILT", pageSize: 1 }, databasePath),
        getFoundationTransactions({ state: "SUBMITTED", pageSize: 1 }, databasePath),
        getFoundationTransactions({ state: "CONFIRMED", pageSize: 1 }, databasePath),
      ]),
      latestConfirmed: firstTransaction(getFoundationTransactions({ state: "CONFIRMED", pageSize: 1 }, databasePath)),
      latestFailed: firstTransaction(getFoundationTransactions({ state: "FAILED", pageSize: 1 }, databasePath)),
    };
  } catch {
    return { available: false, reason: "Unavailable" };
  } finally {
    try { database?.close(); } catch { /* Ignore close errors for an unavailable source. */ }
  }
}

function optionalColumn(columns: Set<string>, name: string): string {
  return columns.has(name) ? name : `NULL AS ${name}`;
}

function mapTransaction(row: Record<string, unknown>, currentSolUsd: number | null): FoundationTransaction {
  const valuation = transactionValuation(row, currentSolUsd);
  return {
    quoteId: String(row.quote_id),
    orderId: nullableString(row.order_id),
    buyer: String(row.buyer),
    inputLamports: String(row.input_lamports),
    outputTokenUnits: String(row.output_token_units),
    state: normalizeState(String(row.status)) ?? "FAILED",
    signature: nullableString(row.tx_signature),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    submittedAt: nullableNumber(row.submitted_at),
    confirmedAt: nullableNumber(row.confirmed_at),
    failedAt: nullableNumber(row.failed_at),
    failureReason: sanitizeFailureReason(nullableString(row.failure_reason)),
    ...valuation,
  };
}

function findValuationColumns(columns: Set<string>) {
  return {
    confirmationUsd: firstColumn(columns, ["confirmation_input_usd", "confirmed_input_usd"]),
    confirmationSolUsd: firstColumn(columns, ["confirmation_sol_price_usd", "confirmed_sol_price_usd"]),
    quoteUsd: firstColumn(columns, ["quote_input_usd", "input_usd"]),
    quoteSolUsd: firstColumn(columns, ["quote_sol_price_usd", "reference_sol_price_usd", "sol_price_usd"]),
  };
}

function firstColumn(columns: Set<string>, names: string[]): string | null {
  return names.find((name) => columns.has(name)) ?? null;
}

function valuationSelect(column: string | null, alias: string): string {
  return column ? `${column} AS ${alias}` : `NULL AS ${alias}`;
}

function transactionValuation(
  row: Record<string, unknown>,
  currentSolUsd: number | null,
): Pick<FoundationTransaction, "usdValue" | "solUsdPrice" | "valuationSource"> {
  const lamports = atomicValue(row.input_lamports);
  const confirmationUsd = positiveDecimal(row.confirmation_usd);
  const confirmationPrice = positiveDecimal(row.confirmation_sol_usd);
  if (confirmationUsd || (confirmationPrice && lamports !== null)) {
    return {
      usdValue: confirmationUsd ? moneyValue(confirmationUsd) : usdFromLamports(lamports!, confirmationPrice!),
      solUsdPrice: confirmationPrice,
      valuationSource: "CONFIRMATION",
    };
  }
  const quoteUsd = positiveDecimal(row.quote_usd);
  const quotePrice = positiveDecimal(row.quote_sol_usd);
  if (quoteUsd || (quotePrice && lamports !== null)) {
    return {
      usdValue: quoteUsd ? moneyValue(quoteUsd) : usdFromLamports(lamports!, quotePrice!),
      solUsdPrice: quotePrice,
      valuationSource: "QUOTE",
    };
  }
  if (currentSolUsd !== null && lamports !== null) {
    return {
      usdValue: usdFromLamports(lamports, String(currentSolUsd)),
      solUsdPrice: String(currentSolUsd),
      valuationSource: "CURRENT_ESTIMATE",
    };
  }
  return { usdValue: null, solUsdPrice: null, valuationSource: "UNAVAILABLE" };
}

function summarizeSales(
  confirmedRows: Array<Record<string, unknown>>,
  pendingRows: Array<{ input_lamports: string }>,
  currentSolUsd: number | null,
): FoundationSalesSummary {
  let confirmedLamports = 0n;
  let confirmedUnits = 0n;
  let usdCents = 0n;
  let hasEstimate = false;
  let unavailableUsd = false;
  const buyers = new Set<string>();
  for (const row of confirmedRows) {
    const lamports = atomicValue(row.input_lamports);
    const units = atomicValue(row.output_token_units);
    if (lamports !== null) confirmedLamports += lamports;
    if (units !== null) confirmedUnits += units;
    const buyer = nullableString(row.buyer);
    if (buyer) buyers.add(buyer);
    const valuation = transactionValuation(row, currentSolUsd);
    if (valuation.usdValue === null) unavailableUsd = true;
    else usdCents += decimalToCents(valuation.usdValue);
    if (valuation.valuationSource === "CURRENT_ESTIMATE") hasEstimate = true;
  }
  const pendingInputLamports = pendingRows.reduce((sum, row) => {
    const value = atomicValue(row.input_lamports);
    return value === null ? sum : sum + value;
  }, 0n);
  return {
    confirmedCount: confirmedRows.length,
    confirmedInputLamports: confirmedLamports.toString(),
    confirmedOutputTokenUnits: confirmedUnits.toString(),
    uniqueConfirmedBuyers: buyers.size,
    confirmedUsd: unavailableUsd ? null : centsToMoney(usdCents),
    usdLabel: unavailableUsd ? "Unavailable" : hasEstimate ? "Estimated" : "Historical",
    pendingCount: pendingRows.length,
    pendingInputLamports: pendingInputLamports.toString(),
  };
}

function validCurrentPrice(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function positiveDecimal(value: unknown): string | null {
  if ((typeof value !== "string" && typeof value !== "number") || !/^\d+(?:\.\d+)?$/.test(String(value))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? String(value) : null;
}

function atomicValue(value: unknown): bigint | null {
  return typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : null;
}

function usdFromLamports(lamports: bigint, price: string): string {
  const priceMicros = decimalToScaled(price, 6);
  const cents = (lamports * priceMicros + 5_000_000_000_000n) / 10_000_000_000_000n;
  return centsToMoney(cents);
}

function moneyValue(value: string): string {
  return centsToMoney(decimalToCents(value));
}

function decimalToCents(value: string): bigint {
  return decimalToScaled(value, 2);
}

function decimalToScaled(value: string, decimals: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  const rounded = (fraction + "0".repeat(decimals + 1)).slice(0, decimals + 1);
  let result = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(rounded.slice(0, decimals) || "0");
  if (Number(rounded[decimals] ?? "0") >= 5) result += 1n;
  return result;
}

function centsToMoney(cents: bigint): string {
  const raw = cents.toString().padStart(3, "0");
  return `${raw.slice(0, -2)}.${raw.slice(-2)}`;
}

function normalizeState(value: string): FoundationTransactionState | null {
  if (value === "CONSUMED") return "BUILT";
  return STATES.includes(value as FoundationTransactionState) ? value as FoundationTransactionState : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function boundedInteger(value: number | undefined, fallback: number, min: number, max: number) {
  return Number.isSafeInteger(value) ? Math.min(Math.max(value!, min), max) : fallback;
}
function escapeLike(value: string) { return value.replace(/[\\%_]/g, "\\$&"); }

function firstTransaction(result: FoundationTransactionResult): FoundationTransaction | null {
  return result.available ? result.items[0] ?? null : null;
}

function latestTransaction(results: FoundationTransactionResult[]): FoundationTransaction | null {
  return results
    .flatMap((result) => result.available ? result.items : [])
    .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null;
}

export function sanitizeFailureReason(value: string | null): string | null {
  if (!value) return null;
  const sanitized = value
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\b(api[_-]?key|token|secret|authorization|password|credential)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/bearer\s+\S+/gi, "Bearer [redacted]")
    .trim()
    .slice(0, 300);
  return sanitized || null;
}
