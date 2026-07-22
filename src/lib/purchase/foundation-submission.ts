import { createHash, verify } from "node:crypto";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
// Phantom may add Lighthouse assertion instructions after the buyer approves a
// transaction. Lighthouse cannot move tokens; it checks that the state changes
// shown in Phantom's review remain true at execution time.
const LIGHTHOUSE_PROGRAM_ID = new PublicKey("L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95");
const MAX_WALLET_GUARD_INSTRUCTIONS = 8;

export interface FoundationSubmissionRecord {
  buyer: string;
  saleSignerPublicKey: string | null;
  transactionMessageHash: string | null;
  serializedTransaction?: string | null;
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
  if (!record.transactionMessageHash) {
    throw new Error("Prepared Foundation transaction is missing its approved message hash.");
  }
  if (messageHash !== record.transactionMessageHash) {
    assertPhantomLighthouseAugmentation(transaction, record);
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

/**
 * Phantom's Lighthouse protection intentionally augments a signed transaction
 * with assertion instructions. We accept only that narrow augmentation: every
 * original instruction must remain byte-for-byte equivalent, in order; the
 * only extra programs are Compute Budget and Phantom's verified Lighthouse
 * program; no new signer, lookup table, or external account is permitted.
 */
function assertPhantomLighthouseAugmentation(
  returned: VersionedTransaction,
  record: FoundationSubmissionRecord,
): void {
  if (!record.serializedTransaction) {
    throw new Error("Signed Foundation transaction does not match the prepared quote.");
  }
  let prepared: VersionedTransaction;
  try {
    prepared = VersionedTransaction.deserialize(Buffer.from(record.serializedTransaction, "base64"));
  } catch {
    throw new Error("Prepared Foundation transaction could not be decoded.");
  }
  const preparedHash = createHash("sha256").update(prepared.message.serialize()).digest("hex");
  if (preparedHash !== record.transactionMessageHash) {
    throw new Error("Prepared Foundation transaction integrity check failed.");
  }
  if (prepared.message.recentBlockhash !== returned.message.recentBlockhash) {
    throw new Error("Signed Foundation transaction changed the approved blockhash.");
  }
  if (prepared.message.addressTableLookups.length || returned.message.addressTableLookups.length) {
    throw new Error("Foundation transactions may not add address lookup tables.");
  }

  const preparedSigners = prepared.message.staticAccountKeys.slice(0, prepared.message.header.numRequiredSignatures);
  const returnedSigners = returned.message.staticAccountKeys.slice(0, returned.message.header.numRequiredSignatures);
  if (
    preparedSigners.length !== returnedSigners.length ||
    preparedSigners.some((key, index) => !key.equals(returnedSigners[index]))
  ) {
    throw new Error("Signed Foundation transaction changed its required signers.");
  }

  const preparedInstructions = TransactionMessage.decompile(prepared.message).instructions;
  const returnedInstructions = TransactionMessage.decompile(returned.message).instructions;
  const preparedKeys = new Set(prepared.message.staticAccountKeys.map((key) => key.toBase58()));
  let approvedInstructionIndex = 0;
  let augmentationCount = 0;

  for (const instruction of returnedInstructions) {
    const expected = preparedInstructions[approvedInstructionIndex];
    if (expected && sameInstruction(instruction, expected)) {
      approvedInstructionIndex += 1;
      continue;
    }
    if (!isAllowedPhantomAugmentation(instruction, preparedKeys)) {
      throw new Error("Signed Foundation transaction contains an unapproved instruction.");
    }
    augmentationCount += 1;
    if (augmentationCount > MAX_WALLET_GUARD_INSTRUCTIONS) {
      throw new Error("Signed Foundation transaction contains too many wallet guard instructions.");
    }
  }

  if (approvedInstructionIndex !== preparedInstructions.length) {
    throw new Error("Signed Foundation transaction omitted or reordered an approved instruction.");
  }
}

function isAllowedPhantomAugmentation(instruction: TransactionInstruction, preparedKeys: Set<string>): boolean {
  if (instruction.programId.equals(ComputeBudgetProgram.programId)) {
    return instruction.keys.length === 0 && [2, 3].includes(instruction.data[0] ?? -1) && instruction.data.length <= 9;
  }
  if (!instruction.programId.equals(LIGHTHOUSE_PROGRAM_ID)) return false;
  // Lighthouse may only inspect accounts already approved in the original
  // transaction. Decompilation exposes a key's message-wide signer bit, so a
  // buyer account can appear as a signer here even though Lighthouse itself
  // requested it as a read-only assertion account. Required signer layout is
  // separately checked above.
  return instruction.keys.every((key) => preparedKeys.has(key.pubkey.toBase58()));
}

function sameInstruction(left: TransactionInstruction, right: TransactionInstruction): boolean {
  return left.programId.equals(right.programId) &&
    Buffer.from(left.data).equals(Buffer.from(right.data)) &&
    left.keys.length === right.keys.length &&
    left.keys.every((key, index) => {
      const expected = right.keys[index];
      // Message compilation can promote a key's global writable/read-only
      // classification when Phantom inserts its assertion instructions. The
      // program, data, and ordered account identities are the approved effect;
      // signer layout is checked separately above.
      return key.pubkey.equals(expected.pubkey);
    });
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
