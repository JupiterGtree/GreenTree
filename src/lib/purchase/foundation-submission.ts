import { createHash, verify } from "node:crypto";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export interface FoundationSubmissionRecord {
  buyer: string;
  saleSignerPublicKey: string | null;
  transactionMessageHash: string | null;
}

export function decodeAndVerifyFoundationSubmission(
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
  if (signerKeys.length !== transaction.signatures.length || signerKeys.length < 2) {
    throw new Error("Signed Foundation transaction has an invalid signer layout.");
  }
  if (!signerKeys[0].equals(new PublicKey(record.buyer))) {
    throw new Error("Signed Foundation transaction fee payer does not match the buyer.");
  }
  const saleSignerPublicKey = record.saleSignerPublicKey;
  if (!saleSignerPublicKey || !signerKeys.some((key) => key.equals(new PublicKey(saleSignerPublicKey)))) {
    throw new Error("Signed Foundation transaction is missing the configured sale signer.");
  }

  for (let index = 0; index < signerKeys.length; index += 1) {
    const signature = transaction.signatures[index];
    const publicKey = Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(signerKeys[index].toBytes())]);
    if (
      signature.every((byte) => byte === 0) ||
      !verify(null, message, { key: publicKey, format: "der", type: "spki" }, signature)
    ) {
      throw new Error("Signed Foundation transaction contains an invalid required signature.");
    }
  }
  return transaction;
}
