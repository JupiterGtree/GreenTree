import "./server-only-shim.cjs";
import test from "node:test";
import assert from "node:assert/strict";
import { parseHistoryPageCallback } from "../src/lib/telegram/server";

test("history pagination callbacks contain only bounded page state", () => {
  assert.equal(parseHistoryPageCallback("HISTORY_PAGE:1"), 1);
  assert.equal(parseHistoryPageCallback("HISTORY_PAGE:100000"), 100000);
  assert.equal(parseHistoryPageCallback("HISTORY_PAGE:0"), null);
  assert.equal(parseHistoryPageCallback("HISTORY_PAGE:1:WalletA"), null);
  assert.equal(parseHistoryPageCallback("HISTORY_PAGE:-1"), null);
});
