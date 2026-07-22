import assert from "node:assert/strict";
import test from "node:test";
import { SharedClientSnapshot } from "@/lib/market/shared-client-snapshots";

test("shared snapshots back off failed inventory-style requests and allow a manual retry", async () => {
  let now = 0;
  let calls = 0;
  const snapshot = new SharedClientSnapshot<string>(
    async () => {
      calls += 1;
      throw new Error("Inventory temporarily unavailable.");
    },
    20_000,
    () => now,
  );

  await snapshot.refresh();
  assert.equal(calls, 1);

  await snapshot.refreshIfStale();
  assert.equal(calls, 1, "a failed request must wait for its backoff window");

  now = 4_999;
  await snapshot.refreshIfStale();
  assert.equal(calls, 1);

  now = 5_000;
  await snapshot.refreshIfStale();
  assert.equal(calls, 2, "the shared request may retry after the first 5 second backoff");

  await snapshot.refresh({ force: true });
  assert.equal(calls, 3, "manual refresh bypasses the automatic backoff");
});

test("shared snapshots keep one in-flight request for concurrent consumers", async () => {
  let calls = 0;
  let resolve!: (value: string) => void;
  const snapshot = new SharedClientSnapshot<string>(
    () => {
      calls += 1;
      return new Promise<string>((complete) => { resolve = complete; });
    },
  );

  const first = snapshot.refresh();
  const second = snapshot.refresh();
  assert.equal(calls, 1);
  resolve("150000000");
  assert.equal(await first, "150000000");
  assert.equal(await second, "150000000");
});

test("a successful fresh refresh clears a prior stale market result", async () => {
  let shouldFail = true;
  const snapshot = new SharedClientSnapshot(
    async () => {
      if (shouldFail) throw new Error("temporary RPC failure");
      return { status: "ready", stale: false, data: { sourceStatus: "LIVE" } };
    },
    20_000,
    () => 10_000,
    (previous, error) => ({
      ...previous,
      status: "stale",
      stale: true,
      error,
      data: { sourceStatus: "STALE" },
    }),
  );
  snapshot.seed({ status: "ready", stale: false, data: { sourceStatus: "LIVE" } });

  await snapshot.refresh({ force: true });
  assert.equal(snapshot.getSnapshot().value?.stale, true);
  assert.equal(snapshot.getSnapshot().value?.data.sourceStatus, "STALE");

  shouldFail = false;
  await snapshot.refresh({ force: true });
  assert.equal(snapshot.getSnapshot().error, null);
  assert.equal(snapshot.getSnapshot().value?.stale, false);
  assert.equal(snapshot.getSnapshot().value?.data.sourceStatus, "LIVE");
});

test("an older response cannot replace a newer shared market snapshot", async () => {
  const snapshot = new SharedClientSnapshot(
    async () => ({ version: 1 }),
    20_000,
    () => 10_000,
    undefined,
    undefined,
    (current, next) => next.version >= current.version,
  );
  snapshot.seed({ version: 2 });

  await snapshot.refresh({ force: true });
  assert.deepEqual(snapshot.getSnapshot().value, { version: 2 });
  assert.equal(snapshot.getSnapshot().error, null);
});

test("a snapshot refreshes once it reaches the configured freshness lead", async () => {
  let now = 10_000;
  let calls = 0;
  const snapshot = new SharedClientSnapshot(
    async () => {
      calls += 1;
      return { expiresAt: now + 20_000 };
    },
    5_000,
    () => now,
    undefined,
    (value, currentNow) => value.expiresAt <= currentNow + 5_000,
  );

  await snapshot.refreshIfStale();
  now += 14_999;
  await snapshot.refreshIfStale();
  assert.equal(calls, 1);
  now += 1;
  await snapshot.refreshIfStale();
  assert.equal(calls, 2);
});
