import type { FoundationInventorySnapshot } from "@/types/market";

export const FOUNDATION_TOTAL_ALLOCATION_GTREE = 150_000_000n;

export interface FoundationInventoryInput {
  accountBalance: bigint;
  delegatedAllowance: bigint;
  delegateActive: boolean;
  tokenDecimals: number;
  mint: string;
  saleTokenAccount: string;
  fetchedAt?: string;
}

function toDecimal(raw: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function buildFoundationInventorySnapshot(
  input: FoundationInventoryInput,
): FoundationInventorySnapshot {
  if (!Number.isInteger(input.tokenDecimals) || input.tokenDecimals < 0) {
    throw new Error("Configured GTREE token decimals are invalid.");
  }
  if (input.accountBalance < 0n || input.delegatedAllowance < 0n) {
    throw new Error("Foundation inventory values cannot be negative.");
  }

  const totalAllocation = FOUNDATION_TOTAL_ALLOCATION_GTREE * 10n ** BigInt(input.tokenDecimals);
  const delegatedLimit = input.delegateActive ? input.delegatedAllowance : input.accountBalance;
  const spendable = [input.accountBalance, delegatedLimit, totalAllocation].reduce(
    (minimum, value) => value < minimum ? value : minimum,
  );

  return {
    totalAllocationBaseUnits: totalAllocation.toString(),
    totalAllocationGtree: FOUNDATION_TOTAL_ALLOCATION_GTREE.toString(),
    accountBalanceBaseUnits: input.accountBalance.toString(),
    accountBalanceGtree: toDecimal(input.accountBalance, input.tokenDecimals),
    delegatedAllowanceBaseUnits: input.delegateActive ? input.delegatedAllowance.toString() : null,
    delegatedAllowanceGtree: input.delegateActive ? toDecimal(input.delegatedAllowance, input.tokenDecimals) : null,
    delegateActive: input.delegateActive,
    spendableBaseUnits: spendable.toString(),
    spendableGtree: toDecimal(spendable, input.tokenDecimals),
    tokenDecimals: input.tokenDecimals,
    mint: input.mint,
    saleTokenAccount: input.saleTokenAccount,
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
    status: "LIVE",
  };
}

export function projectFoundationRemaining(
  spendableBaseUnits: string,
  previewOutputBaseUnits: string | null,
): string {
  const spendable = BigInt(spendableBaseUnits);
  if (!previewOutputBaseUnits || !/^\d+$/.test(previewOutputBaseUnits)) return spendable.toString();
  const output = BigInt(previewOutputBaseUnits);
  return output >= spendable ? "0" : (spendable - output).toString();
}
