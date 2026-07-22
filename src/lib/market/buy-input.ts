import { atomicToDecimal, decimalToAtomic, formatDecimalAmount } from "@/lib/market/amounts";
import { previewOutputFromEffectiveRate } from "@/lib/purchase/foundation-quote-client";

export const MAX_BUY_INPUT_CHARACTERS = 32;
export const SOL_INPUT_DECIMALS = 9;

export type BuyInputValidationCode =
  | "parse"
  | "length"
  | "positive"
  | "maximum"
  | "wallet"
  | "inventory";

export type BuyInputValidation = {
  valid: boolean;
  code: BuyInputValidationCode | null;
  message: string | null;
  amount: { normalized: string; raw: string } | null;
  previewRaw: string | null;
};

type BuyInputValidationOptions = {
  maxPurchaseLamports?: string | null;
  spendableLamports?: bigint | null;
  effectiveGtreePerSol?: string | null;
  foundationInventoryBaseUnits?: string | null;
};

function invalid(code: BuyInputValidationCode, message: string): BuyInputValidation {
  return { valid: false, code, message, amount: null, previewRaw: null };
}

export function validateBuyInput(
  rawInput: string,
  options: BuyInputValidationOptions = {},
): BuyInputValidation {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(rawInput)) {
    return invalid("parse", "Enter a decimal SOL amount without signs, separators, or exponent notation.");
  }

  if (rawInput.length > MAX_BUY_INPUT_CHARACTERS) {
    return invalid("length", `SOL amount cannot exceed ${MAX_BUY_INPUT_CHARACTERS} characters.`);
  }

  let amount: { normalized: string; raw: string };
  try {
    amount = decimalToAtomic(rawInput, SOL_INPUT_DECIMALS);
  } catch {
    return invalid("positive", `Enter a finite amount greater than zero with up to ${SOL_INPUT_DECIMALS} decimal places.`);
  }

  if (!Number.isFinite(Number(amount.normalized)) || BigInt(amount.raw) <= 0n) {
    return invalid("positive", "Enter a finite SOL amount greater than zero.");
  }

  if (
    options.maxPurchaseLamports &&
    BigInt(amount.raw) > BigInt(options.maxPurchaseLamports)
  ) {
    return invalid(
      "maximum",
      `Enter no more than ${atomicToDecimal(options.maxPurchaseLamports, SOL_INPUT_DECIMALS)} SOL.`,
    );
  }

  if (
    options.spendableLamports !== null &&
    options.spendableLamports !== undefined &&
    BigInt(amount.raw) > options.spendableLamports
  ) {
    return invalid("wallet", "This amount exceeds your verified spendable SOL balance after reserving network fees.");
  }

  const previewRaw = options.effectiveGtreePerSol
    ? previewOutputFromEffectiveRate(amount.raw, options.effectiveGtreePerSol)
    : null;

  if (
    previewRaw &&
    options.foundationInventoryBaseUnits &&
    BigInt(previewRaw) > BigInt(options.foundationInventoryBaseUnits)
  ) {
    return invalid("inventory", "This purchase exceeds the available Foundation inventory.");
  }

  return { valid: true, code: null, message: null, amount, previewRaw };
}

export function formatCompactDecimal(value: string, maximumFractionDigits = 2): string {
  const exact = formatDecimalAmount(value, maximumFractionDigits);
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || Math.abs(numeric) < 1_000) return exact;
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits,
  }).format(numeric);
}

export function formatDistributionPercent(distributedRaw: string, totalRaw: string): string | null {
  if (!/^\d+$/.test(distributedRaw) || !/^[1-9]\d*$/.test(totalRaw)) return null;
  const distributed = BigInt(distributedRaw);
  if (distributed <= 0n) return "0.00%";
  const hundredths = (distributed * 10_000n) / BigInt(totalRaw);
  if (hundredths === 0n) return "<0.01%";
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}%`;
}
