import "server-only";

import { unstable_cache } from "next/cache";
import { GTREE_POOL_ADDRESS } from "@/lib/constants/env";
import { PROJECT } from "@/lib/constants/project";
import { solanaRpc, solanaRpcBatch } from "@/services/solana/rpc";
import { readyData, unavailableData, type DataResult } from "@/types/data";
import type { RecentTransaction, TransactionKind } from "@/types/transaction";

interface SignatureInfo {
  signature: string;
  blockTime: number | null;
  err: unknown;
  confirmationStatus?: string | null;
}

interface ParsedAccountKey {
  pubkey: string;
  signer: boolean;
  writable: boolean;
}

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
}

interface ParsedTransaction {
  blockTime: number | null;
  transaction: {
    message: { accountKeys: Array<ParsedAccountKey | string> };
  };
  meta: {
    err: unknown;
    logMessages?: string[] | null;
    preTokenBalances?: TokenBalance[] | null;
    postTokenBalances?: TokenBalance[] | null;
  } | null;
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function isSignature(value: unknown): value is string {
  return typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(value);
}

function firstSigner(transaction: ParsedTransaction): string | null {
  for (const key of transaction.transaction.message.accountKeys) {
    if (typeof key !== "string" && key.signer && isAddress(key.pubkey)) return key.pubkey;
  }
  const first = transaction.transaction.message.accountKeys[0];
  return typeof first === "string" && isAddress(first) ? first : null;
}

function rawBalanceForOwner(balances: TokenBalance[] | null | undefined, owner: string): bigint {
  return (balances ?? []).reduce((total, balance) => {
    if (balance.mint !== PROJECT.mint || balance.owner !== owner || !/^\d+$/.test(balance.uiTokenAmount.amount)) {
      return total;
    }
    return total + BigInt(balance.uiTokenAmount.amount);
  }, BigInt(0));
}

function formatRawTokenAmount(raw: bigint, decimals: number): string {
  const negative = raw < BigInt(0);
  const absolute = negative ? -raw : raw;
  const base = BigInt(10) ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = (absolute % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${fraction ? `.${fraction}` : ""}`;
}

function classify(logs: string[], hasGtreeMovement: boolean): TransactionKind {
  const joined = logs.join("\n").toLowerCase();
  if (joined.includes("instruction: swap")) return "swap";
  if (joined.includes("addliquidity") || joined.includes("add liquidity") || joined.includes("removeliquidity") || joined.includes("remove liquidity")) {
    return "liquidity";
  }
  if (hasGtreeMovement) return "token-transfer";
  return "unknown-interaction";
}

function labelFor(kind: TransactionKind): string {
  if (kind === "swap") return "Swap";
  if (kind === "liquidity") return "Liquidity interaction";
  if (kind === "token-transfer") return "Token transfer";
  return "Unknown interaction";
}

async function readRecentTransactions(): Promise<DataResult<RecentTransaction[]>> {
  try {
    const [poolSignatures, mintSignatures] = await Promise.all([
      solanaRpc<SignatureInfo[]>("getSignaturesForAddress", [GTREE_POOL_ADDRESS, { limit: 12, commitment: "confirmed" }]),
      solanaRpc<SignatureInfo[]>("getSignaturesForAddress", [PROJECT.mint, { limit: 12, commitment: "confirmed" }]),
    ]);

    const signatures = [...poolSignatures.map((item) => ({ ...item, sourceAddress: GTREE_POOL_ADDRESS })),
      ...mintSignatures.map((item) => ({ ...item, sourceAddress: PROJECT.mint }))]
      .filter((item) => isSignature(item.signature) && typeof item.blockTime === "number")
      .sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0))
      .filter((item, index, list) => list.findIndex((candidate) => candidate.signature === item.signature) === index)
      .slice(0, 12);

    if (signatures.length === 0) return readyData([], "solana-rpc");

    const parsed = await solanaRpcBatch<ParsedTransaction | null>(
      signatures.map((item) => ({
        method: "getTransaction",
        params: [item.signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
      })),
    );

    const records: RecentTransaction[] = [];
    for (let index = 0; index < signatures.length; index += 1) {
      const info = signatures[index];
      const transaction = parsed[index];
      if (!transaction || typeof transaction.blockTime !== "number" || !transaction.meta) continue;
      const wallet = firstSigner(transaction);
      if (!wallet) continue;

      const before = rawBalanceForOwner(transaction.meta.preTokenBalances, wallet);
      const after = rawBalanceForOwner(transaction.meta.postTokenBalances, wallet);
      const delta = after - before;
      const kind = classify(transaction.meta.logMessages ?? [], delta !== BigInt(0));

      records.push({
        id: info.signature,
        signature: info.signature,
        kind,
        label: labelFor(kind),
        timestamp: new Date(transaction.blockTime * 1000).toISOString(),
        wallet,
        gtreeAmountRaw: delta === BigInt(0) ? null : (delta < BigInt(0) ? -delta : delta).toString(),
        gtreeAmount: delta === BigInt(0) ? null : formatRawTokenAmount(delta < BigInt(0) ? -delta : delta, PROJECT.decimals),
        solAmount: null,
        direction: delta > BigInt(0) ? "in" : delta < BigInt(0) ? "out" : "neutral",
        status: transaction.meta.err === null && info.err === null ? "confirmed" : "failed",
        sourceAddress: info.sourceAddress,
      });
    }

    return readyData(records, "solana-rpc");
  } catch (error) {
    return unavailableData<RecentTransaction[]>(
      "solana-rpc",
      error instanceof Error ? error.message : "Recent Solana transactions are temporarily unavailable.",
    );
  }
}

export const getRecentTransactions = unstable_cache(readRecentTransactions, ["gtree-recent-transactions-v1"], {
  revalidate: 45,
  tags: ["gtree-recent-transactions"],
});
