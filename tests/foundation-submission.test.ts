import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { decodeAndVerifyFoundationSubmission } from "../src/lib/purchase/foundation-submission";

function preparedTransaction(lamports = 1) {
  const buyer = Keypair.generate();
  const saleSigner = Keypair.generate();
  const message = new TransactionMessage({
    payerKey: buyer.publicKey,
    recentBlockhash: PublicKey.unique().toBase58(),
    instructions: [
      SystemProgram.transfer({
        fromPubkey: buyer.publicKey,
        toPubkey: saleSigner.publicKey,
        lamports,
      }),
      new TransactionInstruction({
        programId: SystemProgram.programId,
        keys: [{ pubkey: saleSigner.publicKey, isSigner: true, isWritable: false }],
        data: Buffer.alloc(0),
      }),
    ],
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  transaction.sign([buyer, saleSigner]);
  return { buyer, saleSigner, transaction };
}

function recordFor(transaction: VersionedTransaction, buyer: Keypair, saleSigner: Keypair) {
  return {
    buyer: buyer.publicKey.toBase58(),
    saleSignerPublicKey: saleSigner.publicKey.toBase58(),
    transactionMessageHash: createHash("sha256").update(transaction.message.serialize()).digest("hex"),
  };
}

test("a buyer-signed Foundation transaction must exactly match the prepared message", () => {
  const { buyer, saleSigner, transaction } = preparedTransaction();
  const serialized = Buffer.from(transaction.serialize()).toString("base64");
  const verified = decodeAndVerifyFoundationSubmission(serialized, recordFor(transaction, buyer, saleSigner));
  assert.equal(verified.message.staticAccountKeys[0].toBase58(), buyer.publicKey.toBase58());
});

test("a modified Foundation transaction cannot be relayed", () => {
  const prepared = preparedTransaction(1);
  const modified = preparedTransaction(2);
  const serialized = Buffer.from(modified.transaction.serialize()).toString("base64");
  assert.throws(
    () => decodeAndVerifyFoundationSubmission(serialized, recordFor(prepared.transaction, prepared.buyer, prepared.saleSigner)),
    /does not match the prepared quote/,
  );
});

test("a missing buyer signature cannot be relayed", () => {
  const { buyer, saleSigner, transaction } = preparedTransaction();
  transaction.signatures[0] = new Uint8Array(64);
  const serialized = Buffer.from(transaction.serialize()).toString("base64");
  assert.throws(
    () => decodeAndVerifyFoundationSubmission(serialized, recordFor(transaction, buyer, saleSigner)),
    /invalid required signature/,
  );
});
