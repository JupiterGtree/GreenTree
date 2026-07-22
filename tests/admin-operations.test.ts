/* eslint-disable @typescript-eslint/no-explicit-any */
import { Module } from "node:module";

const originalRequire = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string, ...args: any[]) {
  if (id === "server-only") return {};
  return originalRequire.apply(this, [id, ...args] as any);
};

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
// @ts-expect-error node:sqlite is available in the Node test runtime.
import { DatabaseSync } from "node:sqlite";
import type { AdminIdentity } from "../src/lib/admin/auth";
import { AdminDatabase } from "../src/lib/admin/database";
import { getFoundationTransactions } from "../src/lib/admin/operations-data";
import { AdminPermissionError } from "../src/lib/admin/permissions";
import { RuntimeSettingError, RuntimeSettingsService } from "../src/lib/admin/runtime-settings";
import * as transactionRoute from "../src/app/admin/api/transactions/route";

const NOW = 1_900_000_000_000;
const OWNER: AdminIdentity = {
  id: "00000000-0000-4000-8000-000000000011",
  email: "owner@operations.test",
  role: "OWNER",
  displayName: "Owner",
};
const ADMIN: AdminIdentity = {
  id: "00000000-0000-4000-8000-000000000012",
  email: "admin@operations.test",
  role: "ADMIN",
  displayName: null,
};
const EDITOR: AdminIdentity = {
  id: "00000000-0000-4000-8000-000000000013",
  email: "editor@operations.test",
  role: "EDITOR",
  displayName: null,
};

function adminFixture() {
  const directory = mkdtempSync(join(tmpdir(), "gtt-admin-operations-"));
  const database = new AdminDatabase({ path: join(directory, "admin.sqlite"), now: () => NOW });
  for (const actor of [OWNER, ADMIN, EDITOR]) {
    database.db.prepare(`
      INSERT INTO admin_users (id, email, password_hash, role, display_name, is_active, created_at, updated_at)
      VALUES (?, ?, 'scrypt$v=1$fixture', ?, ?, 1, ?, ?)
    `).run(actor.id, actor.email, actor.role, actor.displayName, NOW, NOW);
  }
  const environment: NodeJS.ProcessEnv = { NODE_ENV: "test" };
  return {
    database,
    settings: new RuntimeSettingsService(database, environment, () => NOW),
    cleanup() { database.close(); rmSync(directory, { recursive: true, force: true }); },
  };
}

test("runtime settings enforce role policy, sensitive confirmation, reason, and audit", (t) => {
  const fixture = adminFixture();
  t.after(() => fixture.cleanup());

  assert.throws(
    () => fixture.settings.update("quoteExpirySeconds", 30, "valid operational reason", undefined, EDITOR),
    AdminPermissionError,
  );
  assert.throws(
    () => fixture.settings.update("emergencyPaused", true, "pause due to incident review", undefined, OWNER),
    (error: unknown) => error instanceof RuntimeSettingError && error.code === "CONFIRMATION",
  );
  assert.throws(
    () => fixture.settings.update("emergencyPaused", true, "pause due to incident review", "CHANGE emergencyPaused", ADMIN),
    AdminPermissionError,
  );
  assert.throws(
    () => fixture.settings.update("referenceCacheTtlMs", 100, "invalid cache interval test", undefined, ADMIN),
    (error: unknown) => error instanceof RuntimeSettingError && error.code === "INVALID",
  );
  assert.throws(
    () => fixture.settings.update("automaticQuoteRefreshIntervalMs", 60_001, "invalid refresh interval test", undefined, ADMIN),
    (error: unknown) => error instanceof RuntimeSettingError && error.code === "INVALID",
  );

  const nonSensitive = fixture.settings.update(
    "quoteExpirySeconds", 30, "align quote expiry with operations", undefined, ADMIN,
  );
  assert.equal(nonSensitive.value, 30);
  const sensitive = fixture.settings.update(
    "emergencyPaused", true, "pause due to incident review", "CHANGE emergencyPaused", OWNER,
  );
  assert.equal(sensitive.value, true);

  const history = fixture.database.db.prepare(
    "SELECT COUNT(*) AS count FROM admin_setting_history",
  ).get() as { count: number };
  assert.equal(Number(history.count), 2);
  const logs = fixture.database.db.prepare(`
    SELECT actor_role, metadata_json FROM admin_audit_logs
    WHERE action = 'RUNTIME_SETTING_CHANGED' ORDER BY id
  `).all() as Array<{ actor_role: string; metadata_json: string }>;
  assert.equal(logs.length, 2);
  assert.equal(logs[0].actor_role, "ADMIN");
  assert.deepEqual(JSON.parse(logs[1].metadata_json).oldValue, false);
  assert.deepEqual(JSON.parse(logs[1].metadata_json).newValue, true);
});

test("runtime setting output is allowlisted and contains no secret configuration", (t) => {
  const fixture = adminFixture();
  t.after(() => fixture.cleanup());
  const settings = fixture.settings.list();
  assert.equal(settings.find((setting) => setting.key === "referenceCacheTtlMs")?.value, 7_500);
  assert.equal(settings.find((setting) => setting.key === "automaticQuoteRefreshIntervalMs")?.value, 7_500);
  const serialized = JSON.stringify(settings).toLowerCase();
  for (const forbidden of ["keypair", "api_key", "session_secret", "password", "rpc_url", "serialized_transaction"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("foundation transactions map legacy states read-only and expose no transaction payload", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gtt-foundation-operations-"));
  const path = join(directory, "foundation-sale.db");
  const database = new DatabaseSync(path);
  database.exec(`
    CREATE TABLE quotes (
      quote_id TEXT PRIMARY KEY, buyer TEXT NOT NULL, input_lamports TEXT NOT NULL,
      output_token_units TEXT NOT NULL, expires_at INTEGER NOT NULL, status TEXT NOT NULL,
      tx_signature TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      order_id TEXT, submitted_at INTEGER, confirmed_at INTEGER, failed_at INTEGER,
      failure_reason TEXT, serialized_transaction TEXT
    )
  `);
  database.prepare(`
    INSERT INTO quotes (
      quote_id, buyer, input_lamports, output_token_units, expires_at, status,
      created_at, updated_at, order_id, serialized_transaction
    ) VALUES ('quote-1', 'buyer-1', '1000', '2000', ?, 'CONSUMED', ?, ?, 'order-1', 'secret-payload')
  `).run(NOW + 10_000, NOW, NOW);
  database.close();
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const result = getFoundationTransactions({ state: "BUILT" }, path);
  assert.equal(result.available, true);
  if (!result.available) return;
  assert.equal(result.total, 1);
  assert.equal(result.items[0].state, "BUILT");
  assert.equal(result.items[0].quoteId, "quote-1");
  assert.equal(JSON.stringify(result).includes("secret-payload"), false);

  const verify = new DatabaseSync(path, { readOnly: true });
  const row = verify.prepare("SELECT status FROM quotes WHERE quote_id = 'quote-1'").get() as { status: string };
  verify.close();
  assert.equal(row.status, "CONSUMED");
});

test("transaction failure reasons are bounded and redact URLs and credentials", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gtt-foundation-failure-"));
  const path = join(directory, "foundation-sale.db");
  const database = new DatabaseSync(path);
  database.exec(`
    CREATE TABLE quotes (
      quote_id TEXT PRIMARY KEY, buyer TEXT NOT NULL, input_lamports TEXT NOT NULL,
      output_token_units TEXT NOT NULL, expires_at INTEGER NOT NULL, status TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, failure_reason TEXT
    )
  `);
  database.prepare(`
    INSERT INTO quotes VALUES ('failed-1', 'buyer-1', '1000', '2000', ?, 'FAILED', ?, ?,
      'RPC https://private.example/key token=do-not-output')
  `).run(NOW + 1_000, NOW, NOW);
  database.close();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const result = getFoundationTransactions({}, path);
  assert.equal(result.available, true);
  if (!result.available) return;
  assert.match(result.items[0].failureReason ?? "", /\[redacted-url\]/);
  assert.match(result.items[0].failureReason ?? "", /token=\[redacted\]/);
  assert.equal(JSON.stringify(result).includes("do-not-output"), false);
  assert.equal(JSON.stringify(result).includes("private.example"), false);
});

test("transactions API has no mutation or manual-confirm handler", () => {
  const exports = transactionRoute as unknown as Record<string, unknown>;
  assert.equal(typeof exports.GET, "function");
  assert.equal(exports.POST, undefined);
  assert.equal(exports.PUT, undefined);
  assert.equal(exports.PATCH, undefined);
  assert.equal(exports.DELETE, undefined);
});

test("foundation sales aggregate confirmed rows and deterministically filter, search, paginate, and label USD", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gtt-foundation-sales-"));
  const path = join(directory, "foundation-sale.db");
  const database = new DatabaseSync(path);
  database.exec(`
    CREATE TABLE quotes (
      quote_id TEXT PRIMARY KEY, buyer TEXT NOT NULL, input_lamports TEXT NOT NULL,
      output_token_units TEXT NOT NULL, expires_at INTEGER NOT NULL, status TEXT NOT NULL,
      tx_signature TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      order_id TEXT, submitted_at INTEGER, confirmed_at INTEGER, failed_at INTEGER,
      failure_reason TEXT, serialized_transaction TEXT, quote_input_usd TEXT,
      quote_sol_price_usd TEXT, confirmation_input_usd TEXT, confirmation_sol_price_usd TEXT
    )
  `);
  const insert = database.prepare(`
    INSERT INTO quotes (
      quote_id, buyer, input_lamports, output_token_units, expires_at, status,
      tx_signature, created_at, updated_at, order_id, submitted_at, confirmed_at,
      failed_at, failure_reason, serialized_transaction, quote_input_usd,
      quote_sol_price_usd, confirmation_input_usd, confirmation_sol_price_usd
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run("quote-confirmed-1", "buyer-alpha", "1000000000", "5000000000", NOW + 10_000,
    "CONFIRMED", "signature-alpha", NOW - 3_000, NOW, "order-alpha", NOW - 2_000, NOW - 1_000,
    null, null, "never-expose-serialized", "15.25", "150", "16.00", "160");
  insert.run("quote-confirmed-2", "buyer-beta", "2000000000", "7000000000", NOW + 10_000,
    "CONFIRMED", "signature-beta", NOW - 2_000, NOW, "order-beta", NOW - 1_000, NOW,
    null, null, "second-secret-payload", null, null, null, null);
  insert.run("quote-pending", "buyer-alpha", "500000000", "3000000000", NOW + 10_000,
    "SUBMITTED", "signature-pending", NOW - 1_000, NOW, "order-pending", NOW, null,
    null, null, null, null, null, null, null);
  insert.run("quote-created-noise", "buyer-noise", "9000000000", "9000000000", NOW + 10_000,
    "CREATED", null, NOW, NOW, "order-created", null, null, null, null,
    "created-secret", null, null, null, null);
  insert.run("quote-failed", "buyer-failed", "100", "200", NOW + 10_000,
    "FAILED", null, NOW, NOW, "order-failed", null, null, NOW,
    "RPC https://secret.invalid token=hidden-value", "failed-secret", null, null, null, null);
  database.close();
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const sales = getFoundationTransactions({ view: "SALES", currentSolUsd: 200, pageSize: 2 }, path);
  assert.equal(sales.available, true);
  if (!sales.available) return;
  assert.equal(sales.total, 3);
  assert.equal(sales.items.length, 2);
  assert.equal(sales.summary.confirmedCount, 2);
  assert.equal(sales.summary.confirmedInputLamports, "3000000000");
  assert.equal(sales.summary.confirmedOutputTokenUnits, "12000000000");
  assert.equal(sales.summary.uniqueConfirmedBuyers, 2);
  assert.equal(sales.summary.confirmedUsd, "416.00");
  assert.equal(sales.summary.usdLabel, "Estimated");
  assert.equal(sales.summary.pendingCount, 1);
  assert.equal(sales.summary.pendingInputLamports, "500000000");

  const confirmed = getFoundationTransactions({ view: "CONFIRMED", currentSolUsd: 200, pageSize: 10 }, path);
  assert.equal(confirmed.available, true);
  if (!confirmed.available) return;
  assert.equal(confirmed.items.find((row) => row.quoteId === "quote-confirmed-1")?.valuationSource, "CONFIRMATION");
  assert.equal(confirmed.items.find((row) => row.quoteId === "quote-confirmed-1")?.usdValue, "16.00");
  assert.equal(confirmed.items.find((row) => row.quoteId === "quote-confirmed-2")?.valuationSource, "CURRENT_ESTIMATE");
  assert.equal(confirmed.items.find((row) => row.quoteId === "quote-confirmed-2")?.usdValue, "400.00");

  for (const query of ["signature-beta", "buyer-beta", "quote-confirmed-2", "order-beta"]) {
    const searched = getFoundationTransactions({ view: "ALL", query }, path);
    assert.equal(searched.available && searched.total, 1);
  }
  const dated = getFoundationTransactions({ view: "CONFIRMED", from: NOW - 2_500, to: NOW }, path);
  assert.equal(dated.available && dated.total, 1);
  const secondPage = getFoundationTransactions({ view: "SALES", page: 2, pageSize: 1 }, path);
  assert.equal(secondPage.available && secondPage.items.length, 1);
  const failed = getFoundationTransactions({ view: "FAILED" }, path);
  assert.equal(failed.available && failed.total, 1);
  const serialized = JSON.stringify([sales, confirmed, failed]);
  for (const secret of ["never-expose-serialized", "second-secret-payload", "failed-secret", "hidden-value", "secret.invalid"]) {
    assert.equal(serialized.includes(secret), false);
  }

  const unavailableUsd = getFoundationTransactions({ view: "CONFIRMED", currentSolUsd: null }, path);
  assert.equal(unavailableUsd.available && unavailableUsd.summary.confirmedUsd, null);
  assert.equal(unavailableUsd.available && unavailableUsd.summary.usdLabel, "Unavailable");
});
