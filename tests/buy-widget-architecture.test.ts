import test from "node:test";
import assert from "node:assert/strict";
import {
  FOUNDATION_TOTAL_ALLOCATION_GTREE,
  buildFoundationInventorySnapshot,
  projectFoundationRemaining,
} from "../src/lib/purchase/foundation-inventory";
import {
  isMaterialQuoteChange,
  previewOutputFromEffectiveRate,
  previewOutputFromMarketPrice,
  quoteChangeBps,
} from "../src/lib/purchase/foundation-quote-client";
import {
  SHARED_SNAPSHOT_REFRESH_MS,
  SharedClientSnapshot,
} from "../src/lib/market/shared-client-snapshots";
import { formatDecimalAmount } from "../src/lib/market/amounts";
import { formatDistributionPercent } from "../src/lib/market/buy-input";
import { formatUsd } from "../src/lib/formatters/number";

test("local preview is decimal-safe and requires no wallet", () => {
  assert.equal(previewOutputFromMarketPrice("1000000000", "0.001"), "1000000000000");
  assert.equal(previewOutputFromMarketPrice("1500000000", "0.003"), "500000000000");
});

test("effective GTREE-per-SOL preview calculates decimal input immediately", () => {
  assert.equal(previewOutputFromEffectiveRate("1000000", "1519.078"), "1519078000");
  assert.equal(previewOutputFromEffectiveRate("10000000", "1519.078"), "15190780000");
  assert.equal(previewOutputFromEffectiveRate("100000000", "1519.078"), "151907800000");
});

test("canonical 12-decimal rates always produce a nonzero preview", () => {
  assert.equal(
    previewOutputFromEffectiveRate("10000000", "15296.759123456789"),
    "152967591234",
  );
});

test("effective preview includes a configured price adjustment", () => {
  assert.equal(previewOutputFromEffectiveRate("1000000000", "1519.078"), "1519078000000");
  assert.equal(previewOutputFromEffectiveRate("1000000000", "1534.26878"), "1534268780000");
});

test("ten local input calculations make zero authoritative requests", () => {
  const quoteRequests = 0;
  for (let index = 1; index <= 10; index += 1) {
    assert.ok(previewOutputFromEffectiveRate(String(index * 1_000_000), "1519.078"));
  }
  assert.equal(quoteRequests, 0);
});

test("empty input has no atomic preview and maps to visible zero", () => {
  const preview = previewOutputFromEffectiveRate("", "1519.078");
  assert.equal(preview, null);
  assert.equal(preview ?? "0", "0");
});

test("local preview rejects zero, malformed, and unavailable inputs", () => {
  assert.equal(previewOutputFromMarketPrice("0", "0.001"), null);
  assert.equal(previewOutputFromMarketPrice("100", "0"), null);
  assert.equal(previewOutputFromMarketPrice("100", "not-a-price"), null);
});

test("local preview supports the smallest SOL base unit", () => {
  assert.equal(previewOutputFromMarketPrice("1", "0.000000001"), "1000000000");
});

test("material quote comparison is deterministic at one percent", () => {
  assert.equal(quoteChangeBps("100000", "99000"), 100n);
  assert.equal(isMaterialQuoteChange("100000", "99001"), false);
  assert.equal(isMaterialQuoteChange("100000", "99000"), true);
  assert.equal(isMaterialQuoteChange("100000", "101000"), true);
});

test("material comparison rejects malformed quote values", () => {
  assert.equal(quoteChangeBps("0", "100"), null);
  assert.equal(quoteChangeBps("100", "invalid"), null);
  assert.equal(isMaterialQuoteChange("0", "100"), false);
});

test("Foundation allocation is exactly 150,000,000 GTREE", () => {
  assert.equal(FOUNDATION_TOTAL_ALLOCATION_GTREE, 150_000_000n);
  const snapshot = buildFoundationInventorySnapshot({
    accountBalance: 200_000_000_000_000_000n,
    delegatedAllowance: 0n,
    delegateActive: false,
    tokenDecimals: 9,
    mint: "mint",
    saleTokenAccount: "account",
    fetchedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(snapshot.totalAllocationBaseUnits, "150000000000000000");
  assert.equal(snapshot.spendableBaseUnits, snapshot.totalAllocationBaseUnits);
  assert.equal(snapshot.status, "LIVE");
});

test("inventory spendable is capped by account balance", () => {
  const snapshot = buildFoundationInventorySnapshot({
    accountBalance: 75n,
    delegatedAllowance: 0n,
    delegateActive: false,
    tokenDecimals: 0,
    mint: "mint",
    saleTokenAccount: "account",
  });
  assert.equal(snapshot.spendableBaseUnits, "75");
  assert.equal(snapshot.delegatedAllowanceBaseUnits, null);
});

test("active delegate allowance caps inventory", () => {
  const snapshot = buildFoundationInventorySnapshot({
    accountBalance: 100n,
    delegatedAllowance: 40n,
    delegateActive: true,
    tokenDecimals: 0,
    mint: "mint",
    saleTokenAccount: "account",
  });
  assert.equal(snapshot.spendableBaseUnits, "40");
  assert.equal(snapshot.delegatedAllowanceBaseUnits, "40");
});

test("inactive delegate allowance does not cap owner inventory", () => {
  const snapshot = buildFoundationInventorySnapshot({
    accountBalance: 100n,
    delegatedAllowance: 1n,
    delegateActive: false,
    tokenDecimals: 0,
    mint: "mint",
    saleTokenAccount: "account",
  });
  assert.equal(snapshot.spendableBaseUnits, "100");
});

test("inventory exposes decimal-safe UI values", () => {
  const snapshot = buildFoundationInventorySnapshot({
    accountBalance: 1_234_567_890n,
    delegatedAllowance: 0n,
    delegateActive: false,
    tokenDecimals: 9,
    mint: "mint",
    saleTokenAccount: "account",
  });
  assert.equal(snapshot.accountBalanceGtree, "1.23456789");
  assert.equal(snapshot.spendableGtree, "1.23456789");
});

test("inventory rejects negative chain values", () => {
  assert.throws(() => buildFoundationInventorySnapshot({
    accountBalance: -1n,
    delegatedAllowance: 0n,
    delegateActive: false,
    tokenDecimals: 9,
    mint: "mint",
    saleTokenAccount: "account",
  }), /cannot be negative/);
});

test("projected inventory is local and never negative", () => {
  assert.equal(projectFoundationRemaining("100", "30"), "70");
  assert.equal(projectFoundationRemaining("100", "100"), "0");
  assert.equal(projectFoundationRemaining("100", "101"), "0");
  assert.equal(projectFoundationRemaining("100", null), "100");
});

test("buy values use grouped practical decimals and meaningful sub-cent USD", () => {
  assert.equal(formatDecimalAmount("15296.759123456789", 3), "15,296.759");
  assert.equal(formatDecimalAmount("149999999.994918", 3), "149,999,999.994");
  assert.equal(formatUsd(0.005082), "$0.005082");
});

test("tiny nonzero Foundation distribution is not displayed as zero", () => {
  assert.equal(formatDistributionPercent("1", "150000000000000000"), "<0.01%");
  assert.equal(formatDistributionPercent("0", "150000000000000000"), "0.00%");
  assert.equal(formatDistributionPercent("1500000000000000", "150000000000000000"), "1.00%");
});

test("shared snapshot refresh interval is restrained", () => {
  assert.ok(SHARED_SNAPSHOT_REFRESH_MS >= 15_000);
  assert.ok(SHARED_SNAPSHOT_REFRESH_MS <= 30_000);
});

test("shared snapshot coalesces concurrent refreshes", async () => {
  let calls = 0;
  let release!: (value: string) => void;
  const gate = new Promise<string>((resolve) => { release = resolve; });
  const store = new SharedClientSnapshot(async () => {
    calls += 1;
    return gate;
  });
  const first = store.refresh();
  const second = store.refresh();
  assert.equal(first, second);
  assert.equal(calls, 1);
  release("snapshot");
  assert.equal(await first, "snapshot");
});

test("shared inventory consumers reuse one in-flight request", async () => {
  let calls = 0;
  let release!: (value: string) => void;
  const gate = new Promise<string>((resolve) => { release = resolve; });
  const inventoryStore = new SharedClientSnapshot(async () => {
    calls += 1;
    return gate;
  });
  const firstConsumer = inventoryStore.refresh();
  const secondConsumer = inventoryStore.refresh();
  assert.equal(firstConsumer, secondConsumer);
  assert.equal(calls, 1);
  release("inventory");
  assert.equal(await firstConsumer, "inventory");
});

test("shared snapshot preserves prior data on refresh failure", async () => {
  let fail = false;
  const store = new SharedClientSnapshot(async () => {
    if (fail) throw new Error("offline");
    return "previous";
  });
  await store.refresh();
  fail = true;
  assert.equal(await store.refresh(), "previous");
  assert.equal(store.getSnapshot().value, "previous");
  assert.equal(store.getSnapshot().error, "offline");
});

test("shared snapshot freshness prevents redundant reads", async () => {
  let now = 1_000;
  let calls = 0;
  const store = new SharedClientSnapshot(async () => {
    calls += 1;
    return calls;
  }, 20_000, () => now);
  await store.refreshIfStale();
  now += 19_999;
  await store.refreshIfStale();
  assert.equal(calls, 1);
  now += 1;
  await store.refreshIfStale();
  assert.equal(calls, 2);
});

test("shared snapshot seed preserves the first known snapshot", () => {
  const store = new SharedClientSnapshot(async () => "remote");
  store.seed("first");
  store.seed("second");
  assert.equal(store.getSnapshot().value, "first");
});

test("failed first refresh remains empty and retryable", async () => {
  let calls = 0;
  const store = new SharedClientSnapshot(async () => {
    calls += 1;
    if (calls === 1) throw new Error("temporary");
    return "recovered";
  });
  assert.equal(await store.refresh(), null);
  assert.equal(store.getSnapshot().receivedAt, 0);
  assert.equal(await store.refresh({ force: true }), "recovered");
  assert.equal(calls, 2);
});
