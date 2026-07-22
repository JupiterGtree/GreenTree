import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isMarketSnapshotPreviewable,
  isMarketSnapshotReviewable,
  isPriceSnapshotConsistent,
  markMarketSnapshotStale,
  marketSnapshotId,
  normalizeMarketSnapshotEnvelope,
} from "../src/lib/market/price-snapshot";
import type { DataResult } from "../src/types/data";
import type { MarketSnapshot } from "../src/types/market";

function snapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  const fetchedAt = "2026-07-21T20:00:00.000Z";
  const values = {
    source: "Meteora DAMM v2",
    solUsd: 90,
    gtreeUsd: 0.06,
    gtreePerSol: "1500",
    effectiveGtreePerSol: "1500",
  };
  return {
    snapshotId: marketSnapshotId(values),
    gtreeUsd: values.gtreeUsd,
    solUsd: values.solUsd,
    gtreePerSol: values.gtreePerSol,
    priceUsd: values.gtreeUsd,
    priceSol: 1 / 1500,
    solPriceUsd: values.solUsd,
    referenceGtreePerSol: values.gtreePerSol,
    effectiveGtreePerSol: values.gtreePerSol,
    priceAdjustmentBps: 0,
    fetchedAt,
    expiresAt: "2026-07-21T20:00:20.000Z",
    sourceStatus: "LIVE",
    change24hPct: null,
    marketCapUsd: null,
    fdvUsd: null,
    liquidityUsd: null,
    liquiditySource: "Reserve-derived estimate",
    volume24hUsd: null,
    holders: null,
    updatedAt: fetchedAt,
    source: "Meteora DAMM v2",
    poolAddress: "pool",
    poolUrl: "https://example.test/pool",
    dex: "Meteora DAMM v2",
    pairName: "GTREE-SOL",
    buys24h: null,
    sells24h: null,
    fee24hUsd: null,
    isBlacklisted: null,
    ...overrides,
  };
}

function ready(data: MarketSnapshot): DataResult<MarketSnapshot> {
  return {
    data,
    source: "meteora-pool",
    fetchedAt: data.fetchedAt,
    status: "ready",
    stale: false,
    error: null,
    network: "solana-mainnet",
  };
}

test("decimal-safe consistency accepts exact and sub-one-percent rates", () => {
  assert.equal(isPriceSnapshotConsistent({ solUsd: "90", gtreeUsd: "0.06", gtreePerSol: "1500" }), true);
  assert.equal(isPriceSnapshotConsistent({ solUsd: "90", gtreeUsd: "0.0605", gtreePerSol: "1500" }), true);
});

test("decimal-safe consistency rejects divergence over one percent and malformed values", () => {
  assert.equal(isPriceSnapshotConsistent({ solUsd: "90", gtreeUsd: "0.061", gtreePerSol: "1500" }), false);
  assert.equal(isPriceSnapshotConsistent({ solUsd: "90", gtreeUsd: "bad", gtreePerSol: "1500" }), false);
});

test("dynamic rates produce distinct deterministic snapshot identities", () => {
  const first = marketSnapshotId({ source: "Meteora DAMM v2", solUsd: "90", gtreeUsd: "0.06", effectiveGtreePerSol: "1500" });
  const same = marketSnapshotId({ source: "Meteora DAMM v2", solUsd: 90, gtreeUsd: 0.0600, effectiveGtreePerSol: "1500.000" });
  const changed = marketSnapshotId({ source: "Meteora DAMM v2", solUsd: "120", gtreeUsd: "0.06", effectiveGtreePerSol: "2000" });
  assert.equal(first, same);
  assert.notEqual(first, changed);
});

test("generated fetch time does not change the economic snapshot identity", () => {
  const values = { source: "Meteora DAMM v2", solUsd: "90", gtreeUsd: "0.06", effectiveGtreePerSol: "1500" };
  const before = { ...snapshot(), fetchedAt: "2026-07-21T20:00:00.000Z", snapshotId: marketSnapshotId(values) };
  const after = { ...snapshot(), fetchedAt: "2026-07-21T20:00:15.000Z", snapshotId: marketSnapshotId(values) };
  assert.equal(before.snapshotId, after.snapshotId);
});

test("actual response envelope normalizes mixed USD types without coercing rates", () => {
  const data = snapshot();
  const envelope = {
    ...ready(data),
    data: {
      ...data,
      expiresAt: new Date(Date.now() + 20_000).toISOString(),
      solUsd: "90",
      gtreeUsd: "0.0600",
    },
  };
  const normalized = normalizeMarketSnapshotEnvelope(envelope);
  assert.equal(normalized.data?.solUsd, 90);
  assert.equal(normalized.data?.gtreeUsd, 0.06);
  assert.equal(normalized.data?.effectiveGtreePerSol, "1500");
});

test("response boundary rejects missing, zero, and non-string rates", () => {
  assert.throws(() => normalizeMarketSnapshotEnvelope({ ...ready(snapshot()), data: null }), /no data/);
  assert.throws(() => normalizeMarketSnapshotEnvelope({
    ...ready(snapshot()),
    data: { ...snapshot(), solUsd: 0 },
  }), /invalid prices or rates/);
  assert.throws(() => normalizeMarketSnapshotEnvelope({
    ...ready(snapshot()),
    data: { ...snapshot(), effectiveGtreePerSol: 1500 },
  }), /invalid prices or rates/);
});

test("an expired server response is never accepted as a fresh client snapshot", () => {
  assert.throws(() => normalizeMarketSnapshotEnvelope({
    ...ready(snapshot()),
    data: snapshot({ expiresAt: new Date(Date.now() - 1).toISOString() }),
  }), /Live market snapshot is unavailable/);
});

test("stale and missing snapshots cannot enter Review", () => {
  const live = ready(snapshot());
  assert.equal(isMarketSnapshotReviewable(live, Date.parse("2026-07-21T20:00:10.000Z")), true);
  assert.equal(isMarketSnapshotReviewable(live, Date.parse("2026-07-21T20:00:21.000Z")), false);
  assert.equal(isMarketSnapshotReviewable(markMarketSnapshotStale(live), Date.parse("2026-07-21T20:00:10.000Z")), false);
  assert.equal(isMarketSnapshotReviewable(null), false);
  assert.equal(isMarketSnapshotPreviewable(markMarketSnapshotStale(live)), true);
  assert.equal(isMarketSnapshotPreviewable(ready(snapshot({ effectiveGtreePerSol: "" }))), false);
});

test("refresh failure retains values and explicitly marks both statuses stale", () => {
  const stale = markMarketSnapshotStale(ready(snapshot()), "offline");
  assert.equal(stale.data?.gtreePerSol, "1500");
  assert.equal(stale.data?.sourceStatus, "STALE");
  assert.equal(stale.status, "stale");
  assert.equal(stale.stale, true);
});

test("history uses the canonical snapshot and exposes its identity", () => {
  const source = readFileSync("src/app/api/market/history/route.ts", "utf8");
  const chart = readFileSync("src/features/market/price-chart.tsx", "utf8");
  assert.match(source, /getMarketSnapshot\(\)/);
  assert.match(source, /snapshotId: snapshot\.snapshotId/);
  assert.doesNotMatch(source, /fetchMeteoraPool/);
  assert.match(chart, /getPriceHistory\(quote, range, snapshotId\)/);
  assert.match(chart, /result\.snapshotId !== snapshotId/);
  assert.match(chart, /view\.history\.snapshotId === snapshotId/);
  assert.doesNotMatch(chart, /markMarketSnapshotStale|refresh\(\{ force: true \}\)/);
});

test("runtime market and buy paths contain no fixed 89-dollar fallback", () => {
  const files = [
    "src/data/market/get-market-snapshot.ts",
    "src/features/market/buy-widget.tsx",
    "src/features/market/market-snapshot.tsx",
    "src/features/market/price-chart.tsx",
    "src/app/api/market/history/route.ts",
  ];
  const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(source, /\$89\b|\b89(?:\.0+)?\b/);
});

test("input changes stay local and only Review requests an authoritative quote", () => {
  const source = readFileSync("src/features/market/buy-widget.tsx", "utf8");
  const updateInput = source.slice(source.indexOf("function updateSolInput"), source.indexOf("function updateSlippage"));
  assert.doesNotMatch(updateInput, /getQuote|requestQuoteForReview/);
  assert.match(source, /onClick=\{\(\) => connected \? canReview && requestQuoteForReview\(\) : openDialog\(\)\}/);
  assert.match(source, /!marketSnapshotReviewable/);
});

test("shared polling pauses while hidden and refreshes on focus or visibility", () => {
  const source = readFileSync("src/lib/market/shared-client-snapshots.ts", "utf8");
  assert.match(source, /document\.hidden/);
  assert.match(source, /window\.addEventListener\("focus", this\.handleFocus\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", this\.handleVisibility\)/);
  assert.match(source, /void this\.refreshIfStale\(\)/);
});
