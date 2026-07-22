import assert from "node:assert/strict";
import test from "node:test";
import { getWalletOptions } from "../src/features/wallet/wallet-context";
import {
  formatMarketAxisTime,
  formatMarketDate,
  formatMarketDateTime,
} from "../src/features/market/price-chart";
import { SharedClientSnapshot } from "../src/lib/market/shared-client-snapshots";
import { formatDateTime } from "../src/lib/formatters/number";

test("market snapshot has a neutral server snapshot until a client refresh completes", () => {
  const snapshot = new SharedClientSnapshot(async () => "ready");
  snapshot.seed("ready");

  assert.equal(snapshot.getServerSnapshot().value, null);
  assert.equal(snapshot.getSnapshot().value, "ready");
});

test("wallet provider detection is disabled for the deterministic initial render", () => {
  assert.deepEqual(
    getWalletOptions(false).map((wallet) => wallet.installed),
    [false, false],
  );
});

test("market and activity dates use an explicit UTC presentation", () => {
  const timestamp = Date.parse("2026-07-22T00:15:00.000Z");

  assert.equal(formatMarketAxisTime(timestamp, "7D"), "Jul 22");
  assert.equal(formatMarketAxisTime(timestamp, "24H"), "12:15 AM");
  assert.equal(formatMarketDate(timestamp), "Jul 22, 2026");
  assert.equal(formatMarketDateTime(timestamp), "Jul 22, 12:15 AM");
  assert.equal(formatDateTime("2026-07-22T00:15:00.000Z"), "Jul 22, 2026, 12:15 AM");
});
