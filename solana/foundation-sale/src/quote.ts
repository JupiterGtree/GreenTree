import { BN } from "@anchor-lang/core";
import { Ed25519Program, Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";

export const QUOTE_DOMAIN = Buffer.from("GTREE_FOUNDATION_PURCHASE_QUOTE_V1", "ascii");
export const QUOTE_FORMAT_VERSION = 1;
export const LOCALNET_CLUSTER_ID = 1;
export const CANONICAL_QUOTE_LENGTH = 270;
export const U64_MAX = (1n << 64n) - 1n;
export const I64_MIN = -(1n << 63n);
export const I64_MAX = (1n << 63n) - 1n;

export type PurchaseQuote = {
  domain: Uint8Array;
  quoteFormatVersion: number;
  clusterId: number;
  configVersion: number;
  programId: PublicKey;
  saleConfig: PublicKey;
  tokenMint: PublicKey;
  treasuryRecipient: PublicKey;
  buyer: PublicKey;
  inputLamports: bigint;
  outputTokenBaseUnits: bigint;
  minimumOutputTokenBaseUnits: bigint;
  issuedAt: bigint;
  expiry: bigint;
  quoteId: Uint8Array;
};

export type SignedQuote = {
  quote: PurchaseQuote;
  message: Buffer;
  signature: Buffer;
  verificationInstruction: TransactionInstruction;
};

function assertFixedLength(value: Uint8Array, length: number, label: string): void {
  if (value.length !== length) {
    throw new RangeError(`${label} must contain exactly ${length} bytes`);
  }
}

function assertU64(value: bigint, label: string): void {
  if (value < 0n || value > U64_MAX) {
    throw new RangeError(`${label} is outside the u64 range`);
  }
}

function assertI64(value: bigint, label: string): void {
  if (value < I64_MIN || value > I64_MAX) {
    throw new RangeError(`${label} is outside the i64 range`);
  }
}

export function deriveSalePdas(programId: PublicKey, tokenMint: PublicKey) {
  const [saleConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("sale-config"), tokenMint.toBuffer()],
    programId,
  );
  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("sale-vault-authority"), saleConfig.toBuffer()],
    programId,
  );
  const [saleVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("sale-vault"), saleConfig.toBuffer()],
    programId,
  );
  return { saleConfig, vaultAuthority, saleVault };
}

export function deriveQuoteReceipt(programId: PublicKey, saleConfig: PublicKey, quoteId: Uint8Array) {
  assertFixedLength(quoteId, 32, "quoteId");
  return PublicKey.findProgramAddressSync(
    [Buffer.from("quote-receipt"), saleConfig.toBuffer(), Buffer.from(quoteId)],
    programId,
  )[0];
}

export function quoteIdFromBigInt(value: bigint): Uint8Array {
  assertU64(value, "quote id counter");
  const quoteId = Buffer.alloc(32);
  quoteId.writeBigUInt64LE(value, 0);
  return quoteId;
}

export function cloneQuote(quote: PurchaseQuote, overrides: Partial<PurchaseQuote> = {}): PurchaseQuote {
  return {
    ...quote,
    domain: Uint8Array.from(quote.domain),
    quoteId: Uint8Array.from(quote.quoteId),
    ...overrides,
  };
}

export function serializePurchaseQuote(quote: PurchaseQuote): Buffer {
  assertFixedLength(quote.domain, 34, "domain");
  assertFixedLength(quote.quoteId, 32, "quoteId");
  assertU64(quote.inputLamports, "inputLamports");
  assertU64(quote.outputTokenBaseUnits, "outputTokenBaseUnits");
  assertU64(quote.minimumOutputTokenBaseUnits, "minimumOutputTokenBaseUnits");
  assertI64(quote.issuedAt, "issuedAt");
  assertI64(quote.expiry, "expiry");
  if (quote.quoteFormatVersion < 0 || quote.quoteFormatVersion > 0xff) {
    throw new RangeError("quoteFormatVersion is outside the u8 range");
  }
  if (quote.clusterId < 0 || quote.clusterId > 0xff) {
    throw new RangeError("clusterId is outside the u8 range");
  }
  if (quote.configVersion < 0 || quote.configVersion > 0xffff) {
    throw new RangeError("configVersion is outside the u16 range");
  }

  const bytes = Buffer.alloc(CANONICAL_QUOTE_LENGTH);
  let offset = 0;
  const writeBytes = (value: Uint8Array) => {
    Buffer.from(value).copy(bytes, offset);
    offset += value.length;
  };
  writeBytes(quote.domain);
  bytes.writeUInt8(quote.quoteFormatVersion, offset++);
  bytes.writeUInt8(quote.clusterId, offset++);
  bytes.writeUInt16LE(quote.configVersion, offset);
  offset += 2;
  writeBytes(quote.programId.toBytes());
  writeBytes(quote.saleConfig.toBytes());
  writeBytes(quote.tokenMint.toBytes());
  writeBytes(quote.treasuryRecipient.toBytes());
  writeBytes(quote.buyer.toBytes());
  bytes.writeBigUInt64LE(quote.inputLamports, offset);
  offset += 8;
  bytes.writeBigUInt64LE(quote.outputTokenBaseUnits, offset);
  offset += 8;
  bytes.writeBigUInt64LE(quote.minimumOutputTokenBaseUnits, offset);
  offset += 8;
  bytes.writeBigInt64LE(quote.issuedAt, offset);
  offset += 8;
  bytes.writeBigInt64LE(quote.expiry, offset);
  offset += 8;
  writeBytes(quote.quoteId);
  if (offset !== CANONICAL_QUOTE_LENGTH) {
    throw new Error(`canonical quote length mismatch: ${offset}`);
  }
  return bytes;
}

export function toAnchorQuote(quote: PurchaseQuote) {
  return {
    domain: Array.from(quote.domain),
    quoteFormatVersion: quote.quoteFormatVersion,
    clusterId: quote.clusterId,
    configVersion: quote.configVersion,
    programId: quote.programId,
    saleConfig: quote.saleConfig,
    tokenMint: quote.tokenMint,
    treasuryRecipient: quote.treasuryRecipient,
    buyer: quote.buyer,
    inputLamports: new BN(quote.inputLamports.toString()),
    outputTokenBaseUnits: new BN(quote.outputTokenBaseUnits.toString()),
    minimumOutputTokenBaseUnits: new BN(quote.minimumOutputTokenBaseUnits.toString()),
    issuedAt: new BN(quote.issuedAt.toString()),
    expiry: new BN(quote.expiry.toString()),
    quoteId: Array.from(quote.quoteId),
  };
}

export function signPurchaseQuote(quote: PurchaseQuote, quoteAuthority: Keypair): SignedQuote {
  const message = serializePurchaseQuote(quote);
  const inlineInstruction = Ed25519Program.createInstructionWithPrivateKey({
    privateKey: quoteAuthority.secretKey,
    message,
  });
  const signatureOffset = inlineInstruction.data.readUInt16LE(2);
  const signature = Buffer.from(
    inlineInstruction.data.subarray(signatureOffset, signatureOffset + 64),
  );
  // Compact Ed25519 layout: public key and signature live in this instruction,
  // while the signed 270-byte message references bytes 8..278 of instruction 1
  // (the Anchor discriminator is the first 8 bytes of purchase_with_quote).
  // This avoids duplicating the canonical quote and keeps the transaction below
  // Solana's 1232-byte serialized transaction limit.
  const publicKeyOffset = 16;
  const compactSignatureOffset = publicKeyOffset + 32;
  const verificationInstructionData = Buffer.alloc(compactSignatureOffset + 64);
  verificationInstructionData.writeUInt8(1, 0);
  verificationInstructionData.writeUInt8(0, 1);
  verificationInstructionData.writeUInt16LE(compactSignatureOffset, 2);
  verificationInstructionData.writeUInt16LE(0xffff, 4);
  verificationInstructionData.writeUInt16LE(publicKeyOffset, 6);
  verificationInstructionData.writeUInt16LE(0xffff, 8);
  verificationInstructionData.writeUInt16LE(8, 10);
  verificationInstructionData.writeUInt16LE(CANONICAL_QUOTE_LENGTH, 12);
  verificationInstructionData.writeUInt16LE(1, 14);
  Buffer.from(quoteAuthority.publicKey.toBytes()).copy(verificationInstructionData, publicKeyOffset);
  signature.copy(verificationInstructionData, compactSignatureOffset);
  const verificationInstruction = new TransactionInstruction({
    programId: Ed25519Program.programId,
    keys: [],
    data: verificationInstructionData,
  });
  return { quote, message, signature, verificationInstruction };
}
