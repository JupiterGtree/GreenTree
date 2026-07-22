const DECIMAL_INPUT_PATTERN = /^\d*(?:\.\d*)?$/;

export function isValidDecimalInput(value: string, decimals: number): boolean {
  if (!DECIMAL_INPUT_PATTERN.test(value) || value.includes("e") || value.includes("E")) return false;
  const [, fraction = ""] = value.split(".");
  return fraction.length <= decimals;
}

export function decimalToAtomic(value: string, decimals: number): { normalized: string; raw: string } {
  const trimmed = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    throw new Error("Enter a valid decimal amount.");
  }

  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    throw new Error(`This amount supports up to ${decimals} decimal places.`);
  }

  const scale = BigInt(10) ** BigInt(decimals);
  const raw = BigInt(whole) * scale + BigInt((fraction || "0").padEnd(decimals, "0"));
  if (raw <= BigInt(0)) throw new Error("Enter an amount greater than zero.");

  const normalizedFraction = fraction.replace(/0+$/, "");
  return {
    normalized: normalizedFraction ? `${BigInt(whole)}.${normalizedFraction}` : BigInt(whole).toString(),
    raw: raw.toString(),
  };
}

export function atomicToDecimal(raw: string | bigint, decimals: number): string {
  const atomic = typeof raw === "bigint" ? raw : BigInt(raw);
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = atomic / scale;
  const fraction = (atomic % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function normalizeDecimalInput(value: string, decimals: number): string {
  if (!value.trim()) return "";
  try {
    return decimalToAtomic(value, decimals).normalized;
  } catch {
    return value;
  }
}

export function formatDecimalAmount(value: string, maximumFractionDigits = 4): string {
  const [whole = "0", fraction = ""] = value.split(".");
  const groupedWhole = BigInt(whole || "0").toLocaleString("en-US");
  const visibleFraction = fraction.slice(0, maximumFractionDigits).replace(/0+$/, "");
  return visibleFraction ? `${groupedWhole}.${visibleFraction}` : groupedWhole;
}

export function fractionOfAtomic(raw: string, numerator: bigint, denominator: bigint): string {
  return ((BigInt(raw) * numerator) / denominator).toString();
}
