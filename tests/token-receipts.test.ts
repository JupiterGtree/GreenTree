import "./server-only-shim.cjs";

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { AdminDatabase } from "../src/lib/admin/database";
import type { AdminIdentity } from "../src/lib/admin/auth";
import { DISTRIBUTION_SOURCE } from "../src/lib/admin/token-distribution-shared";
import { generateReceiptPublicId, sanitizePublicDescription, TokenReceiptError, TokenReceiptService } from "../src/lib/admin/token-receipts";
import { isValidReceiptPublicId, receiptUrl, solscanTxUrl } from "../src/lib/admin/token-receipt-shared";

const OWNER: AdminIdentity = { id: "owner-1", email: "owner@example.test", role: "OWNER", displayName: "Owner" };
const SIGNATURE = "2614fVirtBTYGd1BP3LhqH2HL8dVRyTV4xkZSMULvZtZQEuX8Wu3res5x3u41Y7RgdsgDTCDhz1HWUgsCcBSJqaN";
const RECIPIENT = "FYVjmsiaYQMFRJZqx6puYBBcFQmkhsLVNo8fdknANFBU";
const RECIPIENT_ATA = "4sVD8jQc3aw2FcJ9Twn6iFnMHL1XUiQGxDjiAFZ7aePJ";
const NOW = 1_785_000_000_000;

test("receipt IDs are URL-safe, non-sequential, and unique", () => {
  const ids = new Set(Array.from({ length: 1_000 }, () => generateReceiptPublicId()));
  assert.equal(ids.size, 1_000);
  for (const id of ids) assert.equal(isValidReceiptPublicId(id), true);
  assert.notDeepEqual([...ids].slice(0, 3), ["AAAAAAAAAA", "AAAAAAAAAB", "AAAAAAAAAC"]);
});

test("public description sanitization strips markup and limits length", () => {
  const value = sanitizePublicDescription(" <script>alert(1)</script> Community   Reward ".repeat(5));
  assert.ok(value);
  assert.equal(value.includes("<script>"), false);
  assert.ok(value.length <= 120);
});

test("confirmed distribution receipt verifies GTREE transfer and prevents duplicates", async (t) => {
  const context = setup();
  t.after(() => context.database.close());
  insertConfirmedDistribution(context.database);

  const receipt = await context.service.generateForDistribution("dist-1", OWNER);
  assert.equal(receipt.status, "confirmed");
  assert.equal(receipt.transactionSignature, SIGNATURE);
  assert.equal(receipt.tokenMint, DISTRIBUTION_SOURCE.mint);
  assert.equal(receipt.recipientWallet, RECIPIENT);
  assert.equal(receipt.recipientTokenAccount, RECIPIENT_ATA);
  assert.equal(receipt.amountBaseUnits, "1234567890");
  assert.equal(receipt.amountGtree, "1.23456789");
  assert.equal(receipt.publicDescription, "Community Reward");
  assert.equal(receiptUrl(receipt.publicId), `https://gtree.land/r/${receipt.publicId}`);
  assert.equal(solscanTxUrl(receipt.transactionSignature), `https://solscan.io/tx/${SIGNATURE}`);

  const duplicate = await context.service.generateForDistribution("dist-1", OWNER);
  assert.equal(duplicate.publicId, receipt.publicId);
  assert.equal(countRows(context.database, "transaction_receipts"), 1);
});

test("internal note and administrator data never appear in receipt row", async (t) => {
  const context = setup();
  t.after(() => context.database.close());
  insertConfirmedDistribution(context.database, { internalNote: "secret admin memo", publicDescription: "<b>Contributor Reward</b>" });
  const receipt = await context.service.generateForDistribution("dist-1", OWNER);
  const serialized = JSON.stringify(receipt);
  assert.equal(serialized.includes("secret admin memo"), false);
  assert.equal(serialized.includes("owner@example.test"), false);
  assert.equal(receipt.publicDescription, "Contributor Reward");
});

test("invalid, unknown, and revoked public receipts are not publicly returned", async (t) => {
  const context = setup();
  t.after(() => context.database.close());
  assert.equal(context.service.getPublic("bad-id"), null);
  assert.equal(context.service.getPublic("ABCDEFGHJK"), null);
  insertConfirmedDistribution(context.database);
  const receipt = await context.service.generateForDistribution("dist-1", OWNER);
  assert.ok(context.service.getPublic(receipt.publicId));
  context.service.revoke(receipt.publicId, OWNER);
  assert.equal(context.service.getPublic(receipt.publicId), null);
});

test("historical import derives receipt data from Solana and rejects duplicates", async (t) => {
  const context = setup();
  t.after(() => context.database.close());
  const receipt = await context.service.importExisting(SIGNATURE, "Green Tree Partnership Distribution", OWNER);
  assert.equal(receipt.distributionId, null);
  assert.equal(receipt.recipientWallet, RECIPIENT);
  assert.equal(receipt.amountGtree, "1.23456789");
  const duplicate = await context.service.importExisting(SIGNATURE, "Ignored", OWNER);
  assert.equal(duplicate.publicId, receipt.publicId);
});

test("imports reject failed, wrong mint, and ambiguous transactions", async (t) => {
  for (const fixture of [
    parsedTransaction({ err: { InstructionError: [0, "Custom"] } }),
    parsedTransaction({ mint: "So11111111111111111111111111111111111111112" }),
    parsedTransaction({ extraTransfer: true }),
  ]) {
    const context = setup(fixture);
    t.after(() => context.database.close());
    await assert.rejects(() => context.service.importExisting(SIGNATURE, undefined, OWNER), TokenReceiptError);
  }
});

test("submitted and failed receipt statuses are displayable records", (t) => {
  const context = setup();
  t.after(() => context.database.close());
  context.database.db.prepare(`
    INSERT INTO transaction_receipts (
      public_id, transaction_signature, network, token_mint, recipient_wallet,
      recipient_token_account, amount_gtree, amount_base_units, status, created_at, updated_at
    ) VALUES (?, ?, 'Solana Mainnet', ?, ?, ?, '1', '1000000000', ?, ?, ?)
  `).run("ABCDEFGHJK", SIGNATURE, DISTRIBUTION_SOURCE.mint, RECIPIENT, RECIPIENT_ATA, "submitted", NOW, NOW);
  context.database.db.prepare(`
    INSERT INTO transaction_receipts (
      public_id, transaction_signature, network, token_mint, recipient_wallet,
      recipient_token_account, amount_gtree, amount_base_units, status, created_at, updated_at
    ) VALUES (?, ?, 'Solana Mainnet', ?, ?, ?, '1', '1000000000', ?, ?, ?)
  `).run("ABCDEFGHJL", "3614fVirtBTYGd1BP3LhqH2HL8dVRyTV4xkZSMULvZtZQEuX8Wu3res5x3u41Y7RgdsgDTCDhz1HWUgsCcBSJqaP", DISTRIBUTION_SOURCE.mint, RECIPIENT, RECIPIENT_ATA, "failed", NOW, NOW);
  assert.equal(context.service.getPublic("ABCDEFGHJK")?.status, "submitted");
  assert.equal(context.service.getPublic("ABCDEFGHJL")?.status, "failed");
});

test("receipt feature does not add Telegram-specific implementation files", () => {
  const receiptFiles = [
    "src/lib/admin/token-receipts.ts",
    "src/app/r/[publicReceiptId]/page.tsx",
    "src/app/r/[publicReceiptId]/opengraph-image.tsx",
  ];
  for (const file of receiptFiles) {
    const text = fs.readFileSync(file, "utf8").toLowerCase();
    assert.equal(text.includes("telegram"), false);
    assert.equal(text.includes("webhook"), false);
    assert.equal(text.includes("bot"), false);
  }
});

function setup(transaction = parsedTransaction()) {
  const database = new AdminDatabase({ path: ":memory:" });
  database.db.prepare(`
    INSERT INTO admin_users (id, email, password_hash, role, display_name, created_at, updated_at)
    VALUES (?, ?, ?, 'OWNER', ?, ?, ?)
  `).run(OWNER.id, OWNER.email, "scrypt$v=1$N=2$r=1$p=1$abc$def", OWNER.displayName, NOW, NOW);
  const service = new TokenReceiptService(database, {
    getParsedTransaction: async () => transaction,
  } as never, () => NOW);
  return { database, service };
}

function insertConfirmedDistribution(database: AdminDatabase, options: { internalNote?: string; publicDescription?: string } = {}) {
  database.db.prepare(`
    INSERT INTO token_distributions (
      uuid, recipient_wallet_address, recipient_token_account, amount_gtree, amount_base_units,
      token_mint, source_wallet_address, source_token_account, allocation_category, distribution_type,
      internal_note, public_description, status, transaction_signature, idempotency_key, request_fingerprint,
      dry_run, created_at, updated_at, confirmed_at
    ) VALUES (
      'dist-1', ?, ?, '1.23456789', '1234567890', ?, ?, ?, 'Community Pool', 'Community Reward',
      ?, ?, 'confirmed', ?, 'idem-1', 'fingerprint-1', 0, ?, ?, ?
    )
  `).run(
    RECIPIENT, RECIPIENT_ATA, DISTRIBUTION_SOURCE.mint, DISTRIBUTION_SOURCE.sourceWallet,
    DISTRIBUTION_SOURCE.sourceTokenAccount, options.internalNote ?? "never public",
    options.publicDescription ?? "Community Reward", SIGNATURE, NOW, NOW, NOW,
  );
}

function parsedTransaction(options: {
  err?: unknown;
  mint?: string;
  amount?: string;
  extraTransfer?: boolean;
} = {}) {
  const transfer = {
    program: "spl-token",
    parsed: {
      type: "transferChecked",
      info: {
        source: DISTRIBUTION_SOURCE.sourceTokenAccount,
        destination: RECIPIENT_ATA,
        authority: DISTRIBUTION_SOURCE.delegateSigner,
        mint: options.mint ?? DISTRIBUTION_SOURCE.mint,
        owner: RECIPIENT,
        tokenAmount: { amount: options.amount ?? "1234567890", decimals: 9 },
      },
    },
  };
  return {
    slot: 123456,
    blockTime: Math.trunc(NOW / 1000),
    transaction: {
      message: {
        accountKeys: [
          { pubkey: { toBase58: () => DISTRIBUTION_SOURCE.sourceTokenAccount } },
          { pubkey: { toBase58: () => RECIPIENT_ATA } },
        ],
        instructions: options.extraTransfer ? [transfer, transfer] : [transfer],
      },
    },
    meta: {
      err: options.err ?? null,
      postTokenBalances: [
        { accountIndex: 1, mint: options.mint ?? DISTRIBUTION_SOURCE.mint, owner: RECIPIENT },
      ],
    },
  };
}

function countRows(database: AdminDatabase, table: string) {
  return Number((database.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
}
