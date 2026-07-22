import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { verifyOnChainSettlement } from "../src/lib/purchase/foundation-settlement";
import type { DbQuote } from "../src/lib/purchase/foundation-direct-db";

const buyer = PublicKey.unique();
const treasury = PublicKey.unique();
const source = PublicKey.unique();
const buyerAta = PublicKey.unique();
const mint = PublicKey.unique();
const signature = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const messageBytes = Uint8Array.from([1, 2, 3]);
const messageHash = createHash("sha256").update(messageBytes).digest("hex");
const inputLamports = 1_000_000n;
const outputTokenUnits = 500n;

function quote(overrides: Partial<DbQuote> = {}): DbQuote {
  return {
    quoteId: "settlement-quote",
    buyer: buyer.toBase58(),
    inputLamports,
    outputTokenUnits,
    expiresAt: Date.now() + 60_000,
    status: "SUBMITTED",
    txSignature: signature,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    treasuryRecipient: treasury.toBase58(),
    gtreeMint: mint.toBase58(),
    saleTokenAccount: source.toBase58(),
    transactionMessageHash: messageHash,
    ...overrides,
  };
}

function connection(overrides: { status?: unknown; transaction?: unknown; blockHeight?: number } = {}) {
  return {
    getSignatureStatuses: async () => ({ value: overrides.status === undefined ? [{ err: null, confirmationStatus: "confirmed" }] : [overrides.status] }),
    getBlockHeight: async () => overrides.blockHeight ?? 1,
    getTransaction: async () => overrides.transaction === undefined ? {
      transaction: {
        message: {
          serialize: () => messageBytes,
          staticAccountKeys: [buyer, treasury, source, buyerAta],
        },
      },
      meta: {
        err: null,
        preBalances: [0, 10, 0, 0],
        postBalances: [0, 10 + Number(inputLamports), 0, 0],
        preTokenBalances: [
          { accountIndex: 2, mint: mint.toBase58(), uiTokenAmount: { amount: "1000" } },
          { accountIndex: 3, mint: mint.toBase58(), uiTokenAmount: { amount: "0" } },
        ],
        postTokenBalances: [
          { accountIndex: 2, mint: mint.toBase58(), uiTokenAmount: { amount: "500" } },
          { accountIndex: 3, mint: mint.toBase58(), uiTokenAmount: { amount: "500" } },
        ],
      },
    } : overrides.transaction,
  } as never;
}

test("missing RPC transaction remains PENDING", async () => {
  const result = await verifyOnChainSettlement(connection({ transaction: null }), signature, quote());
  assert.equal(result.status, "PENDING");
});

test("meta.err produces FAILED", async () => {
  const result = await verifyOnChainSettlement(connection({ transaction: { meta: { err: { Custom: 1 } }, transaction: { message: { serialize: () => messageBytes, staticAccountKeys: [buyer] } } } }), signature, quote());
  assert.equal(result.status, "FAILED");
  assert.match(result.reason ?? "", /meta error/i);
});

test("message hash mismatch produces FAILED", async () => {
  const result = await verifyOnChainSettlement(connection(), signature, quote({ transactionMessageHash: "wrong" }));
  assert.equal(result.status, "FAILED");
  assert.match(result.reason ?? "", /hash mismatch/i);
});

test("treasury mismatch produces FAILED", async () => {
  const result = await verifyOnChainSettlement(connection(), signature, quote({ treasuryRecipient: PublicKey.unique().toBase58() }));
  assert.equal(result.status, "FAILED");
  assert.match(result.reason ?? "", /treasury/i);
});

test("SOL amount mismatch produces FAILED", async () => {
  const transaction = awaitedTransaction();
  transaction.meta.postBalances = [0, 11, 0, 0];
  const result = await verifyOnChainSettlement(connection({ transaction }), signature, quote());
  assert.equal(result.status, "FAILED");
  assert.match(result.reason ?? "", /SOL transfer amount mismatch/i);
});

test("mint mismatch produces FAILED", async () => {
  const result = await verifyOnChainSettlement(connection(), signature, quote({ gtreeMint: PublicKey.unique().toBase58() }));
  assert.equal(result.status, "FAILED");
  assert.match(result.reason ?? "", /GTREE token increase mismatch/i);
});

test("GTREE amount mismatch produces FAILED", async () => {
  const result = await verifyOnChainSettlement(connection(), signature, quote({ outputTokenUnits: 501n }));
  assert.equal(result.status, "FAILED");
  assert.match(result.reason ?? "", /token (increase|decrease) mismatch/i);
});

test("valid mocked settlement is CONFIRMED", async () => {
  const result = await verifyOnChainSettlement(connection(), signature, quote());
  assert.equal(result.status, "CONFIRMED");
});

test("submitted quote confirms after quote expiry", async () => {
  const result = await verifyOnChainSettlement(connection(), signature, quote({ expiresAt: Date.now() - 1 }));
  assert.equal(result.status, "CONFIRMED");
});

test("missing submitted transaction fails after definitive blockhash expiry", async () => {
  const result = await verifyOnChainSettlement(
    connection({ status: null, transaction: null, blockHeight: 200 }),
    signature,
    quote({ lastValidBlockHeight: 199 }),
  );
  assert.equal(result.status, "FAILED");
  assert.match(result.reason ?? "", /blockhash expired/i);
});

function awaitedTransaction() {
  return {
    transaction: { message: { serialize: () => messageBytes, staticAccountKeys: [buyer, treasury, source, buyerAta] } },
    meta: {
      err: null,
      preBalances: [0, 10, 0, 0],
      postBalances: [0, 10 + Number(inputLamports), 0, 0],
      preTokenBalances: [
        { accountIndex: 2, mint: mint.toBase58(), uiTokenAmount: { amount: "1000" } },
        { accountIndex: 3, mint: mint.toBase58(), uiTokenAmount: { amount: "0" } },
      ],
      postTokenBalances: [
        { accountIndex: 2, mint: mint.toBase58(), uiTokenAmount: { amount: "500" } },
        { accountIndex: 3, mint: mint.toBase58(), uiTokenAmount: { amount: "500" } },
      ],
    },
  };
}
