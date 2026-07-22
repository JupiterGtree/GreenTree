import "server-only";

import { SERVER_ENV } from "@/config/server-env";
import { ENV } from "@/lib/constants/env";
import { PROJECT, explorerTxUrl } from "@/lib/constants/project";
import { atomicToDecimal } from "@/lib/market/amounts";
import { ExternalRequestError, fetchJson } from "@/services/http/fetch-json";

export const ONCHAIN_ACTIVITY_SIGNATURE_LIMIT = 25;
export const ONCHAIN_ACTIVITY_RESULT_LIMIT = 25;
export const ONCHAIN_ACTIVITY_CONCURRENCY = 4;
export const ONCHAIN_ACTIVITY_RPC_TIMEOUT_MS = 5_000;
export const ONCHAIN_ACTIVITY_CACHE_TTL_MS = 60_000;

export type OnchainActivityType =
  | "FOUNDATION_DIRECT_BUY"
  | "GTREE_TRANSFER"
  | "TREASURY_ACTIVITY"
  | "FAILED"
  | "UNKNOWN";

export interface OnchainActivityRecord {
  id: string;
  type: OnchainActivityType;
  label: string;
  signature: string;
  timestamp: string | null;
  buyerWallet: string | null;
  solAmount: string | null;
  gtreeAmount: string | null;
  destinationTokenAccount: string | null;
  status: "confirmed" | "failed";
  solscanUrl: string;
  sourceAddress: string;
}

export interface OnchainActivityResponse {
  records: OnchainActivityRecord[];
  partialData: boolean;
  fetchedAt: string;
  diagnostics?: {
    signaturesFound: number;
    transactionsParsed: number;
    transactionsClassified: number;
    foundationDirectBuys: number;
    rpcHost: string;
  };
}

export interface OnchainActivityConfig {
  gtreeMint: string;
  treasuryRecipient: string;
  saleTokenAccount: string;
  tokenDecimals: number;
  solscanBaseUrl: string;
  rpcUrl: string;
}

export interface SignatureInfo {
  signature: string;
  blockTime: number | null;
  err: unknown;
  sourceAddress: string;
}

export interface ParsedAccountKey {
  pubkey: string;
  signer?: boolean;
  writable?: boolean;
}

export interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
}

export interface ParsedTransaction {
  blockTime: number | null;
  transaction: {
    message: { accountKeys: Array<ParsedAccountKey | string> };
  };
  meta: {
    err: unknown;
    preBalances?: number[] | null;
    postBalances?: number[] | null;
    preTokenBalances?: TokenBalance[] | null;
    postTokenBalances?: TokenBalance[] | null;
  } | null;
}

interface CachedActivity {
  expiresAt: number;
  payload: OnchainActivityResponse;
}

interface SolanaRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

let requestId = 0;
let activityCache: CachedActivity | null = null;

export function getOnchainActivityConfig(): OnchainActivityConfig {
  const rpcUrl = resolveActivityRpcUrl();
  return {
    gtreeMint: process.env.FOUNDATION_DIRECT_GTREE_MINT?.trim() || PROJECT.mint,
    treasuryRecipient: process.env.FOUNDATION_DIRECT_TREASURY_RECIPIENT?.trim() || "AZzDWNJQWuvwxwCDXhdHNAnj9dgFXMbD6NMQG851hyY7",
    saleTokenAccount: process.env.FOUNDATION_DIRECT_SALE_TOKEN_ACCOUNT?.trim() || "99hWWmZ27yMy2Ykh6sUdtARuPdkLcTZtSqJXEGncq5zX",
    tokenDecimals: PROJECT.decimals,
    solscanBaseUrl: ENV.solscanBaseUrl,
    rpcUrl,
  };
}

function resolveActivityRpcUrl(): string {
  const configured = process.env.SOLANA_RPC_URL?.trim();
  if (configured) return SERVER_ENV.solanaRpcUrl;
  if (process.env.NODE_ENV === "development") {
    logActivity({
      event: "onchain_activity_rpc_fallback",
      message: "Using public Solana Mainnet RPC fallback in development.",
      rpcHost: "api.mainnet-beta.solana.com",
    });
    return "https://api.mainnet-beta.solana.com";
  }
  return SERVER_ENV.solanaRpcUrl;
}

export function sanitizeRpcHost(rpcUrl: string): string {
  try {
    return new URL(rpcUrl).host;
  } catch {
    return "invalid-rpc-host";
  }
}

export function mergeAndSortSignatures(groups: SignatureInfo[][]): SignatureInfo[] {
  const merged = groups.flat().filter((item) => isSignature(item.signature));
  const bySignature = new Map<string, SignatureInfo>();
  for (const item of merged) {
    const existing = bySignature.get(item.signature);
    if (!existing) {
      bySignature.set(item.signature, item);
      continue;
    }
    if ((item.blockTime ?? 0) > (existing.blockTime ?? 0)) {
      bySignature.set(item.signature, item);
    }
  }
  return [...bySignature.values()].sort((left, right) => (right.blockTime ?? 0) - (left.blockTime ?? 0));
}

export function classifyParsedTransaction(
  signature: SignatureInfo,
  transaction: ParsedTransaction | null,
  config: OnchainActivityConfig,
): OnchainActivityRecord | null {
  if (!transaction || !transaction.meta) return null;

  const accountKeys = normalizeAccountKeys(transaction.transaction.message.accountKeys);
  const feePayer = accountKeys[0] ?? null;
  const involvesTrackedAccount = accountKeys.some(
    (key) => key === config.treasuryRecipient || key === config.saleTokenAccount,
  );
  if (!involvesTrackedAccount && signature.sourceAddress !== config.treasuryRecipient && signature.sourceAddress !== config.saleTokenAccount) {
    return null;
  }

  const failed = transaction.meta.err !== null || signature.err !== null;
  const timestamp = typeof transaction.blockTime === "number"
    ? new Date(transaction.blockTime * 1000).toISOString()
    : typeof signature.blockTime === "number"
      ? new Date(signature.blockTime * 1000).toISOString()
      : null;

  const treasurySolDelta = solDeltaForAddress(accountKeys, transaction.meta.preBalances, transaction.meta.postBalances, config.treasuryRecipient);
  const saleGtreeDelta = tokenDeltaForAccount(
    accountKeys,
    transaction.meta.preTokenBalances,
    transaction.meta.postTokenBalances,
    config.saleTokenAccount,
    config.gtreeMint,
  );

  const destinationIncrease = largestExternalGtreeIncrease(
    accountKeys,
    transaction.meta.preTokenBalances,
    transaction.meta.postTokenBalances,
    config.saleTokenAccount,
    config.gtreeMint,
  );

  if (failed) {
    return {
      id: signature.signature,
      type: "FAILED",
      label: "Failed transaction",
      signature: signature.signature,
      timestamp,
      buyerWallet: feePayer,
      solAmount: treasurySolDelta > 0n ? atomicToDecimal(treasurySolDelta, 9) : null,
      gtreeAmount: destinationIncrease ? atomicToDecimal(destinationIncrease.delta, config.tokenDecimals) : null,
      destinationTokenAccount: destinationIncrease?.tokenAccount ?? null,
      status: "failed",
      solscanUrl: explorerTxUrl(config.solscanBaseUrl, signature.signature),
      sourceAddress: signature.sourceAddress,
    };
  }

  const isFoundationDirectBuy =
    treasurySolDelta > 0n &&
    saleGtreeDelta < 0n &&
    destinationIncrease !== null &&
    destinationIncrease.delta > 0n &&
    -saleGtreeDelta === destinationIncrease.delta &&
    feePayer !== null &&
    (destinationIncrease.owner === feePayer || destinationIncrease.owner === null);

  if (isFoundationDirectBuy && destinationIncrease && feePayer) {
    return {
      id: signature.signature,
      type: "FOUNDATION_DIRECT_BUY",
      label: "Foundation Direct buy",
      signature: signature.signature,
      timestamp,
      buyerWallet: feePayer,
      solAmount: atomicToDecimal(treasurySolDelta, 9),
      gtreeAmount: atomicToDecimal(destinationIncrease.delta, config.tokenDecimals),
      destinationTokenAccount: destinationIncrease.tokenAccount,
      status: "confirmed",
      solscanUrl: explorerTxUrl(config.solscanBaseUrl, signature.signature),
      sourceAddress: signature.sourceAddress,
    };
  }

  if (saleGtreeDelta !== 0n) {
    return {
      id: signature.signature,
      type: "GTREE_TRANSFER",
      label: "GTREE transfer",
      signature: signature.signature,
      timestamp,
      buyerWallet: destinationIncrease?.owner ?? feePayer,
      solAmount: treasurySolDelta !== 0n ? atomicToDecimal(treasurySolDelta < 0n ? -treasurySolDelta : treasurySolDelta, 9) : null,
      gtreeAmount: atomicToDecimal(saleGtreeDelta < 0n ? -saleGtreeDelta : saleGtreeDelta, config.tokenDecimals),
      destinationTokenAccount: destinationIncrease?.tokenAccount ?? null,
      status: "confirmed",
      solscanUrl: explorerTxUrl(config.solscanBaseUrl, signature.signature),
      sourceAddress: signature.sourceAddress,
    };
  }

  if (treasurySolDelta !== 0n) {
    return {
      id: signature.signature,
      type: "TREASURY_ACTIVITY",
      label: "Treasury activity",
      signature: signature.signature,
      timestamp,
      buyerWallet: feePayer,
      solAmount: atomicToDecimal(treasurySolDelta < 0n ? -treasurySolDelta : treasurySolDelta, 9),
      gtreeAmount: null,
      destinationTokenAccount: null,
      status: "confirmed",
      solscanUrl: explorerTxUrl(config.solscanBaseUrl, signature.signature),
      sourceAddress: signature.sourceAddress,
    };
  }

  return {
    id: signature.signature,
    type: "UNKNOWN",
    label: "Unknown activity",
    signature: signature.signature,
    timestamp,
    buyerWallet: feePayer,
    solAmount: null,
    gtreeAmount: null,
    destinationTokenAccount: null,
    status: "confirmed",
    solscanUrl: explorerTxUrl(config.solscanBaseUrl, signature.signature),
    sourceAddress: signature.sourceAddress,
  };
}

export function isDisplayableActivity(record: OnchainActivityRecord): boolean {
  if (record.type === "UNKNOWN") return false;
  if (!record.solAmount && !record.gtreeAmount) return false;
  return true;
}

export async function getOnchainActivity(options?: { bypassCache?: boolean }): Promise<OnchainActivityResponse> {
  const now = Date.now();
  if (!options?.bypassCache && activityCache && activityCache.expiresAt > now) {
    return activityCache.payload;
  }

  const config = getOnchainActivityConfig();
  const routeStartedAt = performance.now();
  let partialData = false;
  let signaturesFound = 0;
  let transactionsParsed = 0;
  let transactionsClassified = 0;

  const trackedAddresses = [config.saleTokenAccount, config.treasuryRecipient];
  const signatureGroups = await Promise.all(
    trackedAddresses.map(async (address) => {
      try {
        const started = performance.now();
        const result = await activityRpc<Array<{ signature: string; blockTime: number | null; err: unknown }>>(
          config.rpcUrl,
          "getSignaturesForAddress",
          [address, { limit: ONCHAIN_ACTIVITY_SIGNATURE_LIMIT, commitment: "confirmed" }],
        );
        logActivity({
          event: "onchain_activity_rpc",
          method: "getSignaturesForAddress",
          durationMs: roundedMs(performance.now() - started),
          statusCategory: "ok",
          signatures: result.length,
          rpcHost: sanitizeRpcHost(config.rpcUrl),
        });
        return result.map((item) => ({ ...item, sourceAddress: address }));
      } catch (error) {
        partialData = true;
        logActivity({
          event: "onchain_activity_rpc",
          method: "getSignaturesForAddress",
          durationMs: null,
          statusCategory: statusCategoryForError(error),
          signatures: 0,
          rpcHost: sanitizeRpcHost(config.rpcUrl),
        });
        return [] as SignatureInfo[];
      }
    }),
  );

  if (signatureGroups.every((group) => group.length === 0) && partialData) {
    throw new Error("Unable to load Solana activity.");
  }

  const signatures = mergeAndSortSignatures(signatureGroups).slice(0, ONCHAIN_ACTIVITY_RESULT_LIMIT);
  signaturesFound = signatures.length;

  const parsedTransactions = await mapWithConcurrency(signatures, ONCHAIN_ACTIVITY_CONCURRENCY, async (item) => {
    const started = performance.now();
    try {
      const transaction = await activityRpc<ParsedTransaction | null>(
        config.rpcUrl,
        "getTransaction",
        [item.signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
      );
      logActivity({
        event: "onchain_activity_rpc",
        method: "getTransaction",
        durationMs: roundedMs(performance.now() - started),
        statusCategory: transaction ? "ok" : "empty",
        rpcHost: sanitizeRpcHost(config.rpcUrl),
      });
      return { signature: item, transaction };
    } catch (error) {
      partialData = true;
      logActivity({
        event: "onchain_activity_rpc",
        method: "getTransaction",
        durationMs: roundedMs(performance.now() - started),
        statusCategory: statusCategoryForError(error),
        rpcHost: sanitizeRpcHost(config.rpcUrl),
      });
      return { signature: item, transaction: null as ParsedTransaction | null };
    }
  });

  const records: OnchainActivityRecord[] = [];
  for (const item of parsedTransactions) {
    if (!item.transaction) continue;
    transactionsParsed += 1;
    const classified = classifyParsedTransaction(item.signature, item.transaction, config);
    if (!classified || !isDisplayableActivity(classified)) continue;
    transactionsClassified += 1;
    records.push(classified);
  }

  const payload: OnchainActivityResponse = {
    records: records.slice(0, ONCHAIN_ACTIVITY_RESULT_LIMIT),
    partialData,
    fetchedAt: new Date().toISOString(),
    diagnostics: {
      signaturesFound,
      transactionsParsed,
      transactionsClassified,
      foundationDirectBuys: records.filter((record) => record.type === "FOUNDATION_DIRECT_BUY").length,
      rpcHost: sanitizeRpcHost(config.rpcUrl),
    },
  };

  logActivity({
    event: "onchain_activity_summary",
    durationMs: roundedMs(performance.now() - routeStartedAt),
    signaturesFound,
    transactionsParsed,
    transactionsClassified,
    foundationDirectBuys: payload.diagnostics?.foundationDirectBuys ?? 0,
    partialData,
    rpcHost: sanitizeRpcHost(config.rpcUrl),
  });

  activityCache = {
    expiresAt: Date.now() + ONCHAIN_ACTIVITY_CACHE_TTL_MS,
    payload,
  };
  return payload;
}

export function clearOnchainActivityCache() {
  activityCache = null;
}

async function activityRpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  requestId += 1;
  const response = await fetchJson<SolanaRpcResponse<T>>(
    rpcUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
      cache: "no-store",
    },
    {
      source: "Solana RPC",
      timeoutMs: ONCHAIN_ACTIVITY_RPC_TIMEOUT_MS,
      retries: 1,
    },
  );
  if (response.error || response.result === undefined) {
    throw new Error(response.error?.message || `Solana RPC returned no result for ${method}.`);
  }
  return response.result;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await mapper(items[current], current);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker());
  await Promise.all(workers);
  return results;
}

export function normalizeAccountKeys(keys: Array<ParsedAccountKey | string>): string[] {
  return keys.map((key) => (typeof key === "string" ? key : key.pubkey)).filter(isAddress);
}

export function solDeltaForAddress(
  accountKeys: string[],
  preBalances: number[] | null | undefined,
  postBalances: number[] | null | undefined,
  address: string,
): bigint {
  const index = accountKeys.findIndex((key) => key === address);
  if (index < 0 || !preBalances || !postBalances || preBalances[index] === undefined || postBalances[index] === undefined) {
    return 0n;
  }
  return BigInt(postBalances[index]) - BigInt(preBalances[index]);
}

export function tokenAmountForAccount(
  accountKeys: string[],
  balances: TokenBalance[] | null | undefined,
  tokenAccount: string,
  mint: string,
): bigint {
  const index = accountKeys.findIndex((key) => key === tokenAccount);
  if (index < 0) return 0n;
  const match = (balances ?? []).find((balance) => balance.accountIndex === index && balance.mint === mint);
  if (!match || !/^\d+$/.test(match.uiTokenAmount.amount)) return 0n;
  return BigInt(match.uiTokenAmount.amount);
}

export function tokenDeltaForAccount(
  accountKeys: string[],
  preTokenBalances: TokenBalance[] | null | undefined,
  postTokenBalances: TokenBalance[] | null | undefined,
  tokenAccount: string,
  mint: string,
): bigint {
  return tokenAmountForAccount(accountKeys, postTokenBalances, tokenAccount, mint)
    - tokenAmountForAccount(accountKeys, preTokenBalances, tokenAccount, mint);
}

export function largestExternalGtreeIncrease(
  accountKeys: string[],
  preTokenBalances: TokenBalance[] | null | undefined,
  postTokenBalances: TokenBalance[] | null | undefined,
  saleTokenAccount: string,
  mint: string,
): { tokenAccount: string; owner: string | null; delta: bigint } | null {
  let best: { tokenAccount: string; owner: string | null; delta: bigint } | null = null;
  for (let index = 0; index < accountKeys.length; index += 1) {
    const tokenAccount = accountKeys[index];
    if (tokenAccount === saleTokenAccount) continue;
    const pre = (preTokenBalances ?? []).find((balance) => balance.accountIndex === index && balance.mint === mint);
    const post = (postTokenBalances ?? []).find((balance) => balance.accountIndex === index && balance.mint === mint);
    if (!post || !/^\d+$/.test(post.uiTokenAmount.amount)) continue;
    const before = pre && /^\d+$/.test(pre.uiTokenAmount.amount) ? BigInt(pre.uiTokenAmount.amount) : 0n;
    const after = BigInt(post.uiTokenAmount.amount);
    const delta = after - before;
    if (delta <= 0n) continue;
    if (!best || delta > best.delta) {
      best = {
        tokenAccount,
        owner: typeof post.owner === "string" ? post.owner : null,
        delta,
      };
    }
  }
  return best;
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function isSignature(value: unknown): value is string {
  return typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{64,128}$/.test(value);
}

function statusCategoryForError(error: unknown): string {
  if (error instanceof ExternalRequestError) {
    if (error.outcome === "timeout") return "timeout";
    if (error.outcome === "HTTP error") return `http-${error.status ?? "unknown"}`;
    return error.outcome;
  }
  return "error";
}

function roundedMs(value: number) {
  return Math.round(value * 10) / 10;
}

function logActivity(payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "development") {
    console.info(JSON.stringify(payload));
  }
}
