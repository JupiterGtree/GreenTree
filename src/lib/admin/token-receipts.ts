import "server-only";

import { randomBytes } from "node:crypto";
import { Connection, type ParsedInstruction, type PartiallyDecodedInstruction } from "@solana/web3.js";
import { SERVER_ENV } from "@/config/server-env";
import type { AdminIdentity } from "@/lib/admin/auth";
import { appendAdminAuditLog } from "@/lib/admin/audit";
import { getAdminDatabase, type AdminDatabase } from "@/lib/admin/database";
import { requireAdminPermission } from "@/lib/admin/permissions";
import { DISTRIBUTION_SOURCE, type DistributionRecord } from "@/lib/admin/token-distribution-shared";
import { isValidReceiptPublicId, type TokenReceipt } from "@/lib/admin/token-receipt-shared";

const RECEIPT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RECEIPT_ID_LENGTH = 10;
const NETWORK = "Solana Mainnet";

export class TokenReceiptError extends Error {
  constructor(message: string, readonly code = "INVALID") {
    super(message);
    this.name = "TokenReceiptError";
  }
}

export class TokenReceiptService {
  constructor(
    private readonly database: AdminDatabase = getAdminDatabase(),
    private readonly connection = new Connection(receiptRpcUrl(), "confirmed"),
    private readonly now = Date.now,
  ) {}

  getPublic(publicId: string): TokenReceipt | null {
    if (!isValidReceiptPublicId(publicId)) return null;
    const row = this.database.db.prepare("SELECT * FROM transaction_receipts WHERE public_id = ? AND revoked_at IS NULL").get(publicId) as unknown | undefined;
    return row ? rowToReceipt(row) : null;
  }

  getByDistribution(distributionId: string): TokenReceipt | null {
    const row = this.database.db.prepare("SELECT * FROM transaction_receipts WHERE distribution_id = ? AND revoked_at IS NULL").get(distributionId) as unknown | undefined;
    return row ? rowToReceipt(row) : null;
  }

  getBySignature(signature: string): TokenReceipt | null {
    const row = this.database.db.prepare("SELECT * FROM transaction_receipts WHERE transaction_signature = ? AND revoked_at IS NULL").get(signature) as unknown | undefined;
    return row ? rowToReceipt(row) : null;
  }

  async generateForDistribution(uuid: string, actor: AdminIdentity, mode: "manual" | "automatic" = "manual") {
    requireAdminPermission(actor.role, "token-receipts.create");
    const row = this.database.db.prepare("SELECT * FROM token_distributions WHERE uuid = ?").get(uuid) as unknown | undefined;
    if (!row) throw new TokenReceiptError("Distribution record was not found.", "NOT_FOUND");
    const distribution = distributionRowToRecord(row);
    const existing = this.getByDistribution(distribution.uuid);
    if (existing) {
      this.audit(actor, "TOKEN_RECEIPT_DUPLICATE_PREVENTED", existing.publicId, { distributionId: distribution.uuid });
      return existing;
    }
    if (distribution.status !== "confirmed" || !distribution.transactionSignature) {
      throw new TokenReceiptError("Only confirmed distributions with a transaction signature can receive a public receipt.", "INVALID_STATE");
    }

    const verification = await this.verifySignature(distribution.transactionSignature, {
      recipientWallet: distribution.recipientWalletAddress,
      recipientTokenAccount: distribution.recipientTokenAccount,
      amountBaseUnits: distribution.amountBaseUnits,
      requireConfirmed: true,
    });
    const receipt = this.insertReceipt({
      distributionId: distribution.uuid,
      transactionSignature: distribution.transactionSignature,
      recipientWallet: distribution.recipientWalletAddress,
      recipientTokenAccount: distribution.recipientTokenAccount,
      amountBaseUnits: distribution.amountBaseUnits,
      amountGtree: distribution.amountGtree,
      publicDescription: sanitizePublicDescription(distribution.publicDescription),
      status: "confirmed",
      confirmedAt: distribution.confirmedAt ?? verification.blockTimeMs ?? this.now(),
      blockchainSlot: verification.slot,
      blockchainVerifiedAt: this.now(),
    });
    this.audit(actor, mode === "automatic" ? "TOKEN_RECEIPT_AUTO_CREATED" : "TOKEN_RECEIPT_MANUALLY_GENERATED", receipt.publicId, {
      distributionId: distribution.uuid,
    });
    return receipt;
  }

  async importExisting(signature: string, publicDescription: string | undefined, actor: AdminIdentity) {
    requireAdminPermission(actor.role, "token-receipts.import");
    if (actor.role !== "OWNER") throw new TokenReceiptError("Only OWNER administrators may import token receipts.", "DENIED");
    const normalizedSignature = signature.trim();
    const existing = this.getBySignature(normalizedSignature);
    if (existing) {
      this.audit(actor, "TOKEN_RECEIPT_DUPLICATE_PREVENTED", existing.publicId, { signature: shortSignature(normalizedSignature) });
      return existing;
    }
    try {
      const verification = await this.verifySignature(normalizedSignature, { requireConfirmed: true });
      const receipt = this.insertReceipt({
        distributionId: null,
        transactionSignature: normalizedSignature,
        recipientWallet: verification.recipientWallet,
        recipientTokenAccount: verification.recipientTokenAccount,
        amountBaseUnits: verification.amountBaseUnits,
        amountGtree: atomicToDecimal(BigInt(verification.amountBaseUnits), DISTRIBUTION_SOURCE.decimals),
        publicDescription: sanitizePublicDescription(publicDescription),
        status: "confirmed",
        confirmedAt: verification.blockTimeMs ?? this.now(),
        blockchainSlot: verification.slot,
        blockchainVerifiedAt: this.now(),
      });
      this.audit(actor, "TOKEN_RECEIPT_HISTORICAL_IMPORTED", receipt.publicId, { signature: shortSignature(normalizedSignature) });
      return receipt;
    } catch (error) {
      this.audit(actor, "TOKEN_RECEIPT_IMPORT_REJECTED", null, {
        signature: shortSignature(normalizedSignature),
        reason: error instanceof Error ? error.message.slice(0, 180) : "Unknown import rejection",
      }, "FAILURE");
      throw error;
    }
  }

  async reverify(publicId: string, actor: AdminIdentity) {
    requireAdminPermission(actor.role, "token-receipts.reverify");
    if (actor.role !== "OWNER") throw new TokenReceiptError("Only OWNER administrators may reverify token receipts.", "DENIED");
    const receipt = this.getPublic(publicId);
    if (!receipt) throw new TokenReceiptError("Receipt was not found.", "NOT_FOUND");
    const verification = await this.verifySignature(receipt.transactionSignature, {
      recipientWallet: receipt.recipientWallet,
      recipientTokenAccount: receipt.recipientTokenAccount,
      amountBaseUnits: receipt.amountBaseUnits,
      requireConfirmed: receipt.status === "confirmed",
    });
    const now = this.now();
    this.database.db.prepare(`
      UPDATE transaction_receipts SET status = ?, confirmed_at = COALESCE(confirmed_at, ?),
        blockchain_slot = ?, blockchain_verified_at = ?, updated_at = ? WHERE public_id = ?
    `).run(verification.status, verification.blockTimeMs ?? now, verification.slot, now, now, publicId);
    this.audit(actor, "TOKEN_RECEIPT_REVERIFIED", publicId, { status: verification.status });
    return this.getPublic(publicId)!;
  }

  revoke(publicId: string, actor: AdminIdentity) {
    requireAdminPermission(actor.role, "token-receipts.revoke");
    if (actor.role !== "OWNER") throw new TokenReceiptError("Only OWNER administrators may revoke token receipts.", "DENIED");
    const receipt = this.getPublic(publicId);
    if (!receipt) throw new TokenReceiptError("Receipt was not found.", "NOT_FOUND");
    const now = this.now();
    this.database.db.prepare("UPDATE transaction_receipts SET revoked_at = ?, updated_at = ? WHERE public_id = ?").run(now, now, publicId);
    this.audit(actor, "TOKEN_RECEIPT_REVOKED", publicId, { signature: shortSignature(receipt.transactionSignature) });
    return { revoked: true };
  }

  private insertReceipt(input: {
    distributionId: string | null;
    transactionSignature: string;
    recipientWallet: string;
    recipientTokenAccount: string;
    amountBaseUnits: string;
    amountGtree: string;
    publicDescription: string | null;
    status: "confirmed" | "submitted" | "failed";
    confirmedAt: number | null;
    blockchainSlot: number | null;
    blockchainVerifiedAt: number | null;
  }) {
    const now = this.now();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const publicId = generateReceiptPublicId();
      try {
        this.database.db.prepare(`
          INSERT INTO transaction_receipts (
            public_id, distribution_id, transaction_signature, network, token_mint,
            recipient_wallet, recipient_token_account, amount_gtree, amount_base_units,
            public_description, status, confirmed_at, blockchain_slot,
            blockchain_verified_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          publicId, input.distributionId, input.transactionSignature, NETWORK, DISTRIBUTION_SOURCE.mint,
          input.recipientWallet, input.recipientTokenAccount, input.amountGtree, input.amountBaseUnits,
          input.publicDescription, input.status, input.confirmedAt, input.blockchainSlot,
          input.blockchainVerifiedAt, now, now,
        );
        return this.getPublic(publicId)!;
      } catch (error) {
        if (String(error).includes("UNIQUE") && attempt < 7) continue;
        const existing = this.getBySignature(input.transactionSignature)
          || (input.distributionId ? this.getByDistribution(input.distributionId) : null);
        if (existing) return existing;
        throw error;
      }
    }
    throw new TokenReceiptError("Unable to allocate a public receipt ID.", "COLLISION");
  }

  private async verifySignature(signature: string, expected: Partial<{
    recipientWallet: string;
    recipientTokenAccount: string;
    amountBaseUnits: string;
    requireConfirmed: boolean;
  }>) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(signature.trim())) {
      throw new TokenReceiptError("Transaction signature is invalid.");
    }
    const tx = await this.connection.getParsedTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) throw new TokenReceiptError("Transaction was not found on Solana Mainnet.", "NOT_FOUND");
    if (tx.meta?.err) throw new TokenReceiptError("Failed transactions cannot receive confirmed receipts.", "FAILED_TRANSACTION");
    const status = "confirmed" as const;
    const transfer = extractGtreeTransfer(tx);
    if (!transfer) throw new TokenReceiptError("No unambiguous GTREE transfer from the approved source was found.", "WRONG_MINT");
    if (expected.recipientWallet && transfer.recipientWallet !== expected.recipientWallet) throw new TokenReceiptError("Blockchain recipient does not match the distribution record.", "RECIPIENT_MISMATCH");
    if (expected.recipientTokenAccount && transfer.recipientTokenAccount !== expected.recipientTokenAccount) throw new TokenReceiptError("Blockchain recipient token account does not match the distribution record.", "RECIPIENT_MISMATCH");
    if (expected.amountBaseUnits && transfer.amountBaseUnits !== expected.amountBaseUnits) throw new TokenReceiptError("Blockchain amount does not match the distribution record.", "AMOUNT_MISMATCH");
    return {
      ...transfer,
      status,
      slot: tx.slot ?? null,
      blockTimeMs: tx.blockTime ? tx.blockTime * 1000 : null,
    };
  }

  private audit(actor: AdminIdentity, action: string, publicId: string | null, metadata?: Record<string, unknown>, result: "SUCCESS" | "FAILURE" = "SUCCESS") {
    appendAdminAuditLog(this.database, {
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action,
      targetType: "transaction_receipt",
      targetId: publicId ?? undefined,
      metadata,
      result,
      createdAt: this.now(),
    });
  }
}

export function generateReceiptPublicId() {
  const bytes = randomBytes(RECEIPT_ID_LENGTH);
  return Array.from(bytes, (byte) => RECEIPT_ALPHABET[byte % RECEIPT_ALPHABET.length]).join("");
}

export function sanitizePublicDescription(value: string | undefined | null) {
  const text = value?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 120) : null;
}

function extractGtreeTransfer(tx: Awaited<ReturnType<Connection["getParsedTransaction"]>>) {
  const instructions = tx?.transaction.message.instructions ?? [];
  const tokenOwners = new Map<string, string>();
  const accountKeys = tx?.transaction.message.accountKeys ?? [];
  for (const balance of tx?.meta?.postTokenBalances ?? []) {
    if (balance.mint !== DISTRIBUTION_SOURCE.mint || !balance.owner) continue;
    const accountKey = accountKeys[balance.accountIndex];
    const pubkey = typeof accountKey === "string" ? accountKey : accountKey?.pubkey?.toBase58();
    if (pubkey) tokenOwners.set(pubkey, balance.owner);
  }
  const matches = instructions
    .map((instruction) => extractTransferFromInstruction(instruction, tokenOwners))
    .filter((item): item is NonNullable<ReturnType<typeof extractTransferFromInstruction>> => Boolean(item));
  if (matches.length !== 1) return null;
  return matches[0];
}

function extractTransferFromInstruction(instruction: ParsedInstruction | PartiallyDecodedInstruction, tokenOwners: Map<string, string>) {
  if (!("parsed" in instruction) || instruction.program !== "spl-token") return null;
  const parsed = instruction.parsed as { type?: string; info?: Record<string, unknown> };
  if (parsed.type !== "transferChecked" && parsed.type !== "transfer") return null;
  const info = parsed.info ?? {};
  const mint = String(info.mint ?? "");
  if (mint !== DISTRIBUTION_SOURCE.mint) return null;
  if (String(info.source ?? "") !== DISTRIBUTION_SOURCE.sourceTokenAccount) return null;
  const destination = String(info.destination ?? "");
  const authority = String(info.authority ?? "");
  if (authority !== DISTRIBUTION_SOURCE.delegateSigner && authority !== DISTRIBUTION_SOURCE.sourceWallet) return null;
  const tokenAmount = info.tokenAmount as { amount?: string; decimals?: number } | undefined;
  const amountBaseUnits = tokenAmount?.amount ?? String(info.amount ?? "");
  if (!/^\d+$/.test(amountBaseUnits)) return null;
  const recipientWallet = String(info.owner ?? info.destinationOwner ?? tokenOwners.get(destination) ?? "");
  if (!recipientWallet) return null;
  return {
    recipientWallet,
    recipientTokenAccount: destination,
    amountBaseUnits,
  };
}

function receiptRpcUrl() {
  return process.env.GTREE_DISTRIBUTION_RPC_URL?.trim() || SERVER_ENV.solanaRpcUrl;
}

function rowToReceipt(value: unknown): TokenReceipt {
  const row = value as Record<string, unknown>;
  return {
    publicId: String(row.public_id),
    distributionId: row.distribution_id ? String(row.distribution_id) : null,
    transactionSignature: String(row.transaction_signature),
    network: "Solana Mainnet",
    tokenMint: String(row.token_mint),
    recipientWallet: String(row.recipient_wallet),
    recipientTokenAccount: String(row.recipient_token_account),
    amountGtree: String(row.amount_gtree),
    amountBaseUnits: String(row.amount_base_units),
    publicDescription: row.public_description ? String(row.public_description) : null,
    status: String(row.status) as TokenReceipt["status"],
    confirmedAt: row.confirmed_at === null || row.confirmed_at === undefined ? null : Number(row.confirmed_at),
    blockchainSlot: row.blockchain_slot === null || row.blockchain_slot === undefined ? null : Number(row.blockchain_slot),
    blockchainVerifiedAt: row.blockchain_verified_at === null || row.blockchain_verified_at === undefined ? null : Number(row.blockchain_verified_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    revokedAt: row.revoked_at === null || row.revoked_at === undefined ? null : Number(row.revoked_at),
  };
}

function distributionRowToRecord(value: unknown): DistributionRecord & { confirmedAt: number | null } {
  const row = value as Record<string, unknown>;
  return {
    uuid: String(row.uuid),
    recipientWalletAddress: String(row.recipient_wallet_address),
    recipientTokenAccount: String(row.recipient_token_account),
    recipientTokenAccountExisted: Boolean(row.recipient_token_account_existed),
    amountGtree: String(row.amount_gtree),
    amountBaseUnits: String(row.amount_base_units),
    allocationCategory: String(row.allocation_category),
    distributionType: String(row.distribution_type),
    internalNote: row.internal_note ? String(row.internal_note) : null,
    publicDescription: row.public_description ? String(row.public_description) : null,
    externalReference: row.external_reference ? String(row.external_reference) : null,
    status: String(row.status),
    transactionSignature: row.transaction_signature ? String(row.transaction_signature) : null,
    feePayerMode: row.fee_payer_mode ? String(row.fee_payer_mode) : null,
    feePayerAddress: row.fee_payer_address ? String(row.fee_payer_address) : null,
    estimatedFeeLamports: row.estimated_fee_lamports ? String(row.estimated_fee_lamports) : null,
    estimatedAtaRentLamports: row.estimated_ata_rent_lamports ? String(row.estimated_ata_rent_lamports) : null,
    estimatedTotalCostLamports: row.estimated_total_cost_lamports ? String(row.estimated_total_cost_lamports) : null,
    transactionMessageHash: row.transaction_message_hash ? String(row.transaction_message_hash) : null,
    dryRun: Boolean(row.dry_run),
    failureReason: row.failure_reason ? String(row.failure_reason) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    receipt: null,
    confirmedAt: row.confirmed_at === null || row.confirmed_at === undefined ? null : Number(row.confirmed_at),
  };
}

function atomicToDecimal(value: bigint, decimals: number): string {
  const raw = value.toString().padStart(decimals + 1, "0");
  const whole = raw.slice(0, -decimals);
  const fraction = raw.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function shortSignature(signature: string) {
  return signature.length > 16 ? `${signature.slice(0, 8)}...${signature.slice(-8)}` : signature;
}
