import { NextResponse } from "next/server";
import { GTREE_POOL_ADDRESS } from "@/lib/constants/env";
import type { ChartQuote, ChartRange, PriceHistory } from "@/types/market";
import { getMarketSnapshot } from "@/data/market/get-market-snapshot";
import { fetchJson } from "@/services/http/fetch-json";
import { DATA_SOURCES } from "@/config/data-sources";

const ranges: Record<ChartRange, { seconds: number; timeframe: string }> = {
  "1H": { seconds: 60 * 60, timeframe: "5m" },
  "24H": { seconds: 24 * 60 * 60, timeframe: "30m" },
  "7D": { seconds: 7 * 24 * 60 * 60, timeframe: "4h" },
  // Meteora's current public OHLCV endpoint rejects this pool's 30-day/4h
  // request. The UI labels this as available history and exposes the actual
  // start date instead of fabricating older candles.
  "30D": { seconds: 7 * 24 * 60 * 60, timeframe: "4h" },
};

interface OhlcvResponse {
  data?: Array<{ timestamp?: unknown; close?: unknown; volume?: unknown }>;
}

async function fetchHistory(params: URLSearchParams): Promise<OhlcvResponse> {
  return fetchJson<OhlcvResponse>(
    `https://damm-v2.datapi.meteora.ag/pools/${GTREE_POOL_ADDRESS}/ohlcv?${params}`,
    { cache: "no-store" },
    { source: "Meteora DAMM v2 OHLCV", timeoutMs: DATA_SOURCES["meteora-pool"].timeoutMs, retries: 1 },
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const quote = (searchParams.get("quote") === "SOL" ? "SOL" : "USD") as ChartQuote;
  const requestedRange = searchParams.get("range");
  const range = (requestedRange && requestedRange in ranges ? requestedRange : "24H") as ChartRange;
  const config = ranges[range];
  const end = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({
    timeframe: config.timeframe,
    start_time: String(end - config.seconds),
    end_time: String(end),
  });

  try {
    const referenceParams = new URLSearchParams({
      timeframe: "4h",
      start_time: String(end - ranges["30D"].seconds),
      end_time: String(end),
    });
    const [history, snapshotResult] = await Promise.all([fetchHistory(params), getMarketSnapshot()]);
    const snapshot = snapshotResult.data;
    if (
      !snapshot ||
      snapshotResult.status !== "ready" ||
      snapshotResult.stale ||
      snapshot.sourceStatus !== "LIVE"
    ) {
      throw new Error("Canonical market snapshot is unavailable.");
    }
    const requestedSnapshotId = searchParams.get("snapshotId");
    if (requestedSnapshotId && requestedSnapshotId !== snapshot.snapshotId) {
      return NextResponse.json(
        { error: "Market snapshot changed; refresh chart data." },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    let reference = history;
    if ((history.data ?? []).length === 0) {
      reference = await fetchHistory(referenceParams);
    }
    const solUsd = snapshot.solUsd;
    const points = (history.data ?? [])
      .filter((point) =>
        Number.isFinite(Number(point.timestamp)) &&
        Number.isFinite(Number(point.close)) &&
        Number(point.close) > 0 &&
        Number.isFinite(Number(point.volume)) &&
        Number(point.volume) >= 0,
      )
      .map((point) => ({
        timestamp: Number(point.timestamp) * 1000,
        price: quote === "USD" ? Number(point.close) * solUsd : Number(point.close),
        volume: Number(point.volume),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
    const changePct = points.length > 1
      ? ((points.at(-1)!.price - points[0].price) / points[0].price) * 100
      : null;
    const referencePoints = reference.data ?? [];
    const lastTrade = [...referencePoints].reverse().find((point) => Number(point.volume) > 0);
    const firstReferenceTimestamp = Number(referencePoints[0]?.timestamp);
    const lastTradeTimestamp = Number(lastTrade?.timestamp);
    const result: PriceHistory = {
      snapshotId: snapshot.snapshotId,
      fetchedAt: snapshot.fetchedAt,
      expiresAt: snapshot.expiresAt,
      sourceStatus: snapshot.sourceStatus,
      quote,
      range,
      points,
      changePct,
      spotPrice: quote === "USD" ? snapshot.gtreeUsd : snapshot.priceSol,
      venue: "Meteora DAMM v2",
      router: "Jupiter",
      poolAddress: GTREE_POOL_ADDRESS,
      poolUrl: `https://app.meteora.ag/pools/${GTREE_POOL_ADDRESS}`,
      availableFrom: Number.isFinite(firstReferenceTimestamp) ? firstReferenceTimestamp * 1000 : null,
      lastTradeAt: Number.isFinite(lastTradeTimestamp) ? lastTradeTimestamp * 1000 : null,
    };
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Price history unavailable." },
      { status: 503 },
    );
  }
}
