import { createHash, verify } from "node:crypto";
import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export interface FoundationSubmissionRecord {
  buyer: string;
  saleSignerPublicKey: string | null;
  transactionMessageHash: string | null;
}

export function decodeAndVerifyBuyerSignedFoundationSubmission(
  serializedTransaction: string,
  record: FoundationSubmissionRecord,
): VersionedTransaction {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(serializedTransaction) || serializedTransaction.length > 4_096) {
    throw new Error("Signed Foundation transaction is malformed.");
  }

  const bytes = Buffer.from(serializedTransaction, "base64");
  if (bytes.length === 0 || bytes.length > 2_048) {
    throw new Error("Signed Foundation transaction has an invalid size.");
  }

  const transaction = VersionedTransaction.deserialize(bytes);
  const message = transaction.message.serialize();
  const messageHash = createHash("sha256").update(message).digest("hex");
  if (!record.transactionMessageHash || messageHash !== record.transactionMessageHash) {
    throw new Error("Signed Foundation transaction does not match the prepared quote.");
  }

  const signerKeys = transaction.message.staticAccountKeys.slice(0, transaction.message.header.numRequiredSignatures);
  if (signerKeys.length !== transaction.signatures.length || signerKeys.length !== 2) {
    throw new Error("Signed Foundation transaction has an invalid signer layout.");
  }
  if (!signerKeys[0].equals(new PublicKey(record.buyer))) {
    throw new Error("Signed Foundation transaction fee payer does not match the buyer.");
  }
  const saleSignerPublicKey = record.saleSignerPublicKey;
  if (!saleSignerPublicKey || !signerKeys[1].equals(new PublicKey(saleSignerPublicKey))) {
    throw new Error("Signed Foundation transaction is missing the configured sale signer.");
  }

  const buyerSignature = transaction.signatures[0];
  if (!isValidSignature(signerKeys[0], message, buyerSignature)) {
    throw new Error("Signed Foundation transaction contains an invalid buyer signature.");
  }
  if (!isEmptySignature(transaction.signatures[1])) {
    throw new Error("Foundation delegate signature must be added only after buyer approval.");
  }

  return transaction;
}

export function addAndVerifyFoundationDelegateSignature(
  transaction: VersionedTransaction,
  saleSigner: Keypair,
): VersionedTransaction {
  const message = transaction.message.serialize();
  const signerKeys = transaction.message.staticAccountKeys.slice(0, transaction.message.header.numRequiredSignatures);
  if (signerKeys.length !== 2 || !signerKeys[1].equals(saleSigner.publicKey)) {
    throw new Error("Foundation delegate does not match the approved transaction.");
  }

  transaction.sign([saleSigner]);
  if (!isValidSignature(signerKeys[0], message, transaction.signatures[0])) {
    throw new Error("Buyer signature became invalid before Foundation settlement.");
  }
  if (!isValidSignature(signerKeys[1], message, transaction.signatures[1])) {
    throw new Error("Foundation delegate could not sign the approved transaction.");
  }
  return transaction;
}

export function assertFoundationSimulationSucceeded(simulation: { value: { err: unknown } }): void {
  if (simulation.value.err !== null) {
    throw new Error(`Foundation transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
  }
}

function isEmptySignature(signature: Uint8Array): boolean {
  return signature.every((byte) => byte === 0);
}

function isValidSignature(publicKey: PublicKey, message: Uint8Array, signature: Uint8Array): boolean {
  if (isEmptySignature(signature)) return false;
  const publicKeyDer = Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKey.toBytes())]);
  return verify(null, message, { key: publicKeyDer, format: "der", type: "spki" }, signature);
}
