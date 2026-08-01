import "./server-only-shim.cjs";
import test from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import { SQLiteFoundationSaleControlStore } from "../src/lib/purchase/foundation-direct-db";
import { getOnChainGtreeBalance } from "../src/lib/telegram/wallet-data";

function store() {
  return new SQLiteFoundationSaleControlStore(`telegram-wallet-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

test("wallet summary isolates wallet and separates confirmed/pending totals", async () => {
  const db = store();
  await db.createQuote("q-a", "WalletA", 1_000_000_000n, 2_000_000_000n, Date.now() + 60_000);
  await db.updateQuoteStatus("q-a", "CONFIRMED", "sig-a");
  await db.createQuote("q-p", "WalletA", 500_000_000n, 900_000_000n, Date.now() + 60_000);
  await db.updateQuoteStatus("q-p", "SUBMITTED", "sig-p");
  await db.createQuote("q-other", "WalletB", 9_000_000_000n, 9_000_000_000n, Date.now() + 60_000);
  const summary = db.getWalletPurchaseSummary("WalletA");
  assert.equal(summary.confirmedGtreeTokenUnits, "2000000000");
  assert.equal(summary.confirmedSolLamports, "1000000000");
  assert.equal(summary.confirmedPurchaseCount, 1);
  assert.equal(summary.pendingPurchaseCount, 1);
  assert.equal(summary.latestConfirmedPurchases[0]?.purchaseId, "q-a");
  assert.equal(db.getWalletPurchaseSummary("WalletB").confirmedPurchaseCount, 0);
});

test("wallet history pagination is bounded and exact", async () => {
  const db = store();
  for (let i = 0; i < 7; i += 1) await db.createQuote(`q-${i}`, "WalletA", 1n, 2n, Date.now() + 60_000);
  const page = db.getWalletPurchaseHistory("WalletA", { page: 2, pageSize: 3 });
  assert.equal(page.total, 7);
  assert.equal(page.page, 2);
  assert.equal(page.pageSize, 3);
  assert.equal(page.totalPages, 3);
  assert.equal(page.items.length, 3);
  assert.equal(db.getWalletPurchaseHistory("WalletA", { page: 0, pageSize: 999 }).page, 1);
  assert.equal(db.getWalletPurchaseHistory("WalletA", { page: 1, pageSize: 999 }).pageSize, 50);
});

test("on-chain balance handles no account, zero balance, and RPC failure without real RPC", async () => {
  const wallet = PublicKey.unique().toBase58();
  const noAccount = await getOnChainGtreeBalance(wallet, { getParsedTokenAccountsByOwner: async () => ({ value: [] }) });
  assert.equal(noAccount.lookupStatus, "no_token_account");
  const zero = await getOnChainGtreeBalance(wallet, { getParsedTokenAccountsByOwner: async () => ({ value: [{ account: { data: { parsed: { info: { tokenAmount: { amount: "0", decimals: 9 } } } } } }] }) });
  assert.equal(zero.lookupStatus, "ok");
  assert.equal(zero.gtreeBalance, "0");
  const failure = await getOnChainGtreeBalance(wallet, { getParsedTokenAccountsByOwner: async () => { throw new Error("rpc down"); } });
  assert.equal(failure.lookupStatus, "rpc_error");
});

test("invalid wallet is rejected before RPC", async () => {
  const result = await getOnChainGtreeBalance("not-a-wallet", { getParsedTokenAccountsByOwner: async () => { throw new Error("must not call"); } });
  assert.equal(result.lookupStatus, "invalid_wallet");
});
