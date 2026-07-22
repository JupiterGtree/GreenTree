import type { DataResult } from "@/types/data";
import type { MarketSnapshot } from "@/types/market";

const CONSISTENCY_SCALE = 18;
const CONSISTENCY_TOLERANCE_BPS = 100n;
const POSITIVE_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function decimalToScaledInteger(value: string | number, scale = CONSISTENCY_SCALE): bigint | null {
  const text = String(value).trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const fraction = (match[2] ?? "").slice(0, scale).padEnd(scale, "0");
  const result = BigInt(match[1]) * 10n ** BigInt(scale) + BigInt(fraction || "0");
  return result > 0n ? result : null;
}

function canonicalPositiveDecimal(value: string | number): string | null {
  const text = String(value).trim();
  if (!POSITIVE_DECIMAL_PATTERN.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const normalizedFraction = fraction.replace(/0+$/, "");
  const normalized = normalizedFraction
    ? `${BigInt(whole)}.${normalizedFraction}`
    : BigInt(whole).toString();
  return decimalToScaledInteger(normalized) ? normalized : null;
}

function positiveNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function positiveDecimalString(value: unknown): string | null {
  return typeof value === "string" ? canonicalPositiveDecimal(value) : null;
}

export function isPriceSnapshotConsistent(input: {
  solUsd: string | number;
  gtreeUsd: string | number;
  gtreePerSol: string | number;
}): boolean {
  const solUsd = decimalToScaledInteger(input.solUsd);
  const gtreeUsd = decimalToScaledInteger(input.gtreeUsd);
  const gtreePerSol = decimalToScaledInteger(input.gtreePerSol);
  if (!solUsd || !gtreeUsd || !gtreePerSol) return false;

  const scale = 10n ** BigInt(CONSISTENCY_SCALE);
  const derivedSolUsd = (gtreeUsd * gtreePerSol) / scale;
  const difference = derivedSolUsd > solUsd ? derivedSolUsd - solUsd : solUsd - derivedSolUsd;
  return difference * 10_000n <= solUsd * CONSISTENCY_TOLERANCE_BPS;
}

export function marketSnapshotId(input: {
  source: string;
  solUsd: string | number;
  gtreeUsd: string | number;
  effectiveGtreePerSol: string;
  sourceTimestamp?: string | null;
}): string {
  const solUsd = canonicalPositiveDecimal(input.solUsd);
  const gtreeUsd = canonicalPositiveDecimal(input.gtreeUsd);
  const effectiveRate = positiveDecimalString(input.effectiveGtreePerSol);
  if (!input.source.trim() || !solUsd || !gtreeUsd || !effectiveRate) {
    throw new Error("Cannot identify an invalid market snapshot.");
  }
  const sourceTimestamp = input.sourceTimestamp?.trim();
  return [
    "market",
    encodeURIComponent(input.source.trim()),
    solUsd,
    gtreeUsd,
    effectiveRate,
    sourceTimestamp ? encodeURIComponent(sourceTimestamp) : "",
  ].join(":");
}

export function isMarketSnapshotExpired(snapshot: MarketSnapshot, now = Date.now()): boolean {
  const expiresAt = Date.parse(snapshot.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

export function isMarketSnapshotReviewable(
  result: DataResult<MarketSnapshot> | null,
  now = Date.now(),
): boolean {
  return Boolean(
    result?.data &&
    result.status === "ready" &&
    !result.stale &&
    result.data.sourceStatus === "LIVE" &&
    !isMarketSnapshotExpired(result.data, now),
  );
}

export function isMarketSnapshotPreviewable(
  result: DataResult<MarketSnapshot> | null,
): boolean {
  const snapshot = result?.data;
  return Boolean(
    snapshot &&
    (snapshot.sourceStatus === "LIVE" || snapshot.sourceStatus === "STALE") &&
    positiveNumber(snapshot.solUsd) &&
    positiveNumber(snapshot.gtreeUsd) &&
    positiveDecimalString(snapshot.referenceGtreePerSol) &&
    positiveDecimalString(snapshot.effectiveGtreePerSol),
  );
}

type MarketSnapshotEnvelope = DataResult<MarketSnapshot>;

export function normalizeMarketSnapshotEnvelope(value: unknown): MarketSnapshotEnvelope {
  if (!value || typeof value !== "object") {
    throw new Error("Market snapshot response envelope is invalid.");
  }
  const result = value as Record<string, unknown>;
  if (!result.data || typeof result.data !== "object") {
    throw new Error("Market snapshot response has no data.");
  }
  const raw = result.data as Record<string, unknown>;
  const solUsd = positiveNumber(raw.solUsd);
  const gtreeUsd = positiveNumber(raw.gtreeUsd);
  const gtreePerSol = positiveDecimalString(raw.gtreePerSol);
  const referenceGtreePerSol = positiveDecimalString(raw.referenceGtreePerSol);
  const effectiveGtreePerSol = positiveDecimalString(raw.effectiveGtreePerSol);
  if (!solUsd || !gtreeUsd || !gtreePerSol || !referenceGtreePerSol || !effectiveGtreePerSol) {
    throw new Error("Market snapshot response contains invalid prices or rates.");
  }

  const snapshot = {
    ...raw,
    solUsd,
    gtreeUsd,
    gtreePerSol,
    referenceGtreePerSol,
    effectiveGtreePerSol,
  } as unknown as MarketSnapshot;
  if (
    result.status !== "ready" ||
    result.stale !== false ||
    snapshot.sourceStatus !== "LIVE" ||
    result.fetchedAt !== snapshot.fetchedAt ||
    snapshot.snapshotId !== marketSnapshotId({
      source: snapshot.source,
      solUsd,
      gtreeUsd,
      effectiveGtreePerSol,
      sourceTimestamp: snapshot.sourceTimestamp,
    }) ||
    !isPriceSnapshotConsistent(snapshot)
  ) {
    throw new Error(
      typeof result.error === "string" && result.error
        ? result.error
        : "Live market snapshot is unavailable.",
    );
  }
  return { ...result, data: snapshot } as MarketSnapshotEnvelope;
}

export function markMarketSnapshotStale(
  result: DataResult<MarketSnapshot>,
  error = "Market snapshot refresh failed.",
): DataResult<MarketSnapshot> {
  if (!result.data) return result;
  return {
    ...result,
    data: { ...result.data, sourceStatus: "STALE" },
    status: "stale",
    stale: true,
    error,
  };
}
