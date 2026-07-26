import "./server-only-shim.cjs";

import assert from "node:assert/strict";
import test from "node:test";
import {
  DISTRIBUTION_SOURCE,
} from "../src/lib/admin/token-distribution-shared";
import {
  parseGtreeAmount,
  readDistributionConfig,
} from "../src/lib/admin/token-distributions";

test("GTREE distribution source constants are fixed to the approved allocation", () => {
  assert.equal(DISTRIBUTION_SOURCE.mint, "AYJ2xXLxNrcJfx7ycgZA6FQnpTSoipdRcCvJPLMadpuJ");
  assert.equal(DISTRIBUTION_SOURCE.sourceTokenAccount, "99hWWmZ27yMy2Ykh6sUdtARuPdkLcTZtSqJXEGncq5zX");
  assert.equal(DISTRIBUTION_SOURCE.sourceWallet, "AZzDWNJQWuvwxwCDXhdHNAnj9dgFXMbD6NMQG851hyY7");
  assert.equal(DISTRIBUTION_SOURCE.delegateSigner, "D91Bj6xejiB3QQiCJfrbE1c8xRyF1NNnjU2rvE5EVyD9");
  assert.equal(DISTRIBUTION_SOURCE.decimals, 9);
});

test("GTREE decimal parser converts exact base units", () => {
  assert.deepEqual(parseGtreeAmount("1"), { normalized: "1", baseUnits: 1_000_000_000n });
  assert.deepEqual(parseGtreeAmount("0.1"), { normalized: "0.1", baseUnits: 100_000_000n });
  assert.deepEqual(parseGtreeAmount("0.000000001"), { normalized: "0.000000001", baseUnits: 1n });
  assert.deepEqual(parseGtreeAmount("123.450000000"), { normalized: "123.45", baseUnits: 123_450_000_000n });
});

test("GTREE decimal parser rejects unsafe values", () => {
  for (const value of ["0", "-1", "1e3", "1,000", "abc", "0.0000000001", "  "]) {
    assert.throws(() => parseGtreeAmount(value));
  }
});

test("distribution config defaults to disabled dry-run auto fee payer", () => {
  const config = readDistributionConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.dryRun, true);
  assert.equal(config.feePayerMode, "AUTO");
  assert.equal(config.allowConnectedAdminFeePayer, true);
});

test("distribution config supports connected-admin-only fee payer mode", () => {
  const config = readDistributionConfig({
    GTREE_DISTRIBUTION_ENABLED: "true",
    GTREE_DISTRIBUTION_DRY_RUN: "false",
    GTREE_DISTRIBUTION_FEE_PAYER_MODE: "CONNECTED_ADMIN_ONLY",
    GTREE_DISTRIBUTION_ALLOW_CONNECTED_ADMIN_FEE_PAYER: "true",
    GTREE_DISTRIBUTION_MIN_SOL_BALANCE: "1000",
    GTREE_DISTRIBUTION_FEE_SAFETY_MARGIN_LAMPORTS: "2000",
  });
  assert.equal(config.enabled, true);
  assert.equal(config.dryRun, false);
  assert.equal(config.feePayerMode, "CONNECTED_ADMIN_ONLY");
  assert.equal(config.minSolBalanceLamports, 1000n);
  assert.equal(config.feeSafetyMarginLamports, 2000n);
});
