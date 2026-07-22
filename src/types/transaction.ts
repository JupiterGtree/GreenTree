export type OnchainActivityType =
  | "FOUNDATION_DIRECT_BUY"
  | "GTREE_TRANSFER"
  | "TREASURY_ACTIVITY"
  | "FAILED"
  | "UNKNOWN";

export type TransactionStatus = "confirmed" | "failed";

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
  status: TransactionStatus;
  solscanUrl: string;
  sourceAddress: string;
}

/** @deprecated Prefer OnchainActivityRecord for Market activity feed. */
export type TransactionKind = "swap" | "token-transfer" | "liquidity" | "unknown-interaction";
export type TransactionDirection = "in" | "out" | "neutral";

/** @deprecated Prefer OnchainActivityRecord for Market activity feed. */
export interface RecentTransaction {
  id: string;
  signature: string;
  kind: TransactionKind;
  label: string;
  timestamp: string;
  wallet: string;
  gtreeAmountRaw: string | null;
  gtreeAmount: string | null;
  solAmount: string | null;
  direction: TransactionDirection;
  status: TransactionStatus;
  sourceAddress: string;
}
