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
