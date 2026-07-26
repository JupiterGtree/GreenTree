import "server-only";

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { SERVER_ENV } from "@/config/server-env";
import type { AdminIdentity } from "@/lib/admin/auth";
import { appendAdminAuditLog } from "@/lib/admin/audit";
import { getAdminDatabase, type AdminDatabase } from "@/lib/admin/database";
import { requireAdminPermission } from "@/lib/admin/permissions";
import { DISTRIBUTION_SOURCE, type DistributionDashboard, type DistributionRecord } from "@/lib/admin/token-distribution-shared";

const CATEGORIES = [
  "Community Pool",
  "Public Distribution",
  "Marketing and Partnerships",
  "Ecosystem Growth Fund",
  "Seasonal Growth Fund",
  "Strategic Reserve",
  "Other",
] as const;

const TYPES = [
  "Community Reward",
  "Giveaway",
  "Partnership",
  "Marketing",
  "Contributor Reward",
  "Manual Distribution",
  "Airdrop",
  "Other",
] as const;

const FINAL_STATES = new Set(["processing", "submitted", "confirmed", "unknown"]);

export type DistributionCategory = typeof CATEGORIES[number];
export type DistributionType = typeof TYPES[number];
export type FeePayerMode = "AUTO" | "SERVER_ONLY" | "CONNECTED_ADMIN_ONLY";
export type SelectedFeePayer = "SERVER" | "CONNECTED_ADMIN" | "WAITING";

export interface DistributionConfig {
  enabled: boolean;
  dryRun: boolean;
  feePayerMode: FeePayerMode;
  allowConnectedAdminFeePayer: boolean;
  maxPerTransferBaseUnits: bigint | null;
  dailyLimitBaseUnits: bigint | null;
  minSolBalanceLamports: bigint;
  feeSafetyMarginLamports: bigint;
  confirmationPhrase: string;
}


export interface PreviewInput {
  recipientWalletAddress: string;
  amountGtree: string;
  allocationCategory: string;
  distributionType: string;
  internalNote?: string;
  publicDescription?: string;
  externalReference?: string;
  idempotencyKey?: string;
  connectedFeePayerAddress?: string | null;
}

export class TokenDistributionError extends Error {
  constructor(message: string, readonly code = "INVALID") {
    super(message);
    this.name = "TokenDistributionError";
  }
}

export class TokenDistributionService {
  constructor(
    private readonly database: AdminDatabase = getAdminDatabase(),
    private readonly connection = new Connection(distributionRpcUrl(), distributionCommitment()),
    private readonly now = Date.now,
  ) {}

  categories = CATEGORIES;
  distributionTypes = TYPES;

  async dashboard(actor: AdminIdentity): Promise<DistributionDashboard> {
    requireAdminPermission(actor.role, "token-distributions.view");
    const [source, stats] = await Promise.all([this.verifySource(), this.stats()]);
    return {
      config: this.configView(),
      source,
      feePayer: {
        selected: source.serverSignerSolLamports !== "0" && source.configurationErrors.length === 0 ? "SERVER" : "WAITING",
        serverReady: serverReady(source, readDistributionConfig(), 0n),
        serverFundingRequired: source.serverSignerSolLamports === "0" || !serverReady(source, readDistributionConfig(), 0n),
        warning: serverReady(source, readDistributionConfig(), 0n) ? null : "Fee payer funding required",
      },
      stats,
      recent: this.list({}, actor).items.slice(0, 8),
    };
  }

  list(filters: { query?: string; status?: string; page?: number; pageSize?: number }, actor: AdminIdentity) {
    requireAdminPermission(actor.role, "token-distributions.view");
    const page = Math.max(Math.trunc(filters.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Math.trunc(filters.pageSize ?? 25), 1), 100);
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    if (filters.query?.trim()) {
      clauses.push("(recipient_wallet_address LIKE ? OR recipient_token_account LIKE ? OR transaction_signature LIKE ? OR external_reference LIKE ?)");
      const q = `%${filters.query.trim()}%`;
      params.push(q, q, q, q);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const total = Number((this.database.db.prepare(`SELECT COUNT(*) AS count FROM token_distributions ${where}`).get(...params) as { count: number }).count);
    const rows = this.database.db.prepare(`
      SELECT * FROM token_distributions ${where}
      ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize) as unknown[];
    return { items: rows.map(rowToRecord), total, page, pageSize };
  }

  get(uuid: string, actor: AdminIdentity): DistributionRecord {
    requireAdminPermission(actor.role, "token-distributions.view");
    const row = this.database.db.prepare("SELECT * FROM token_distributions WHERE uuid = ?").get(uuid) as unknown | undefined;
    if (!row) throw new TokenDistributionError("Distribution record was not found.", "NOT_FOUND");
    return rowToRecord(row);
  }

  async preview(input: PreviewInput, actor: AdminIdentity): Promise<{ record: DistributionRecord; dashboard: DistributionDashboard }> {
    requireAdminPermission(actor.role, "token-distributions.create");
    if (actor.role !== "OWNER") throw new TokenDistributionError("Only OWNER administrators may create token distributions.", "DENIED");
    const config = readDistributionConfig();
    const source = await this.verifySource();
    if (source.configurationErrors.length) throw new TokenDistributionError(source.configurationErrors[0], "CONFIGURATION");
    const normalized = await this.normalizeInput(input, config, source);
    const fee = await this.buildPreviewTransaction(normalized, config, input.connectedFeePayerAddress || null, false);
    const now = this.now();
    const uuid = randomUUID();
    const idempotencyKey = input.idempotencyKey?.trim() || randomUUID();
    const requestFingerprint = fingerprint({
      recipient: normalized.recipient.toBase58(),
      amount: normalized.amountBaseUnits.toString(),
      category: normalized.allocationCategory,
      type: normalized.distributionType,
      source: DISTRIBUTION_SOURCE.sourceTokenAccount,
      mint: DISTRIBUTION_SOURCE.mint,
    });

    this.database.transaction(() => {
      this.database.db.prepare(`
        INSERT INTO token_distributions (
          uuid, recipient_wallet_address, recipient_token_account, recipient_token_account_existed,
          amount_gtree, amount_base_units, token_mint, source_wallet_address, source_token_account,
          allocation_category, distribution_type, internal_note, public_description, external_reference,
          status, idempotency_key, request_fingerprint, simulation_success, simulation_error,
          sanitized_simulation_logs, fee_payer_mode, fee_payer_address, fee_payer_balance_lamports_at_preview,
          estimated_fee_lamports, estimated_ata_rent_lamports, estimated_total_cost_lamports,
          transaction_message_hash, server_partial_signature_present, dry_run, created_by_user_id,
          created_at, updated_at, previewed_at, admin_wallet_connected_at, fee_payer_verified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'previewed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuid, normalized.recipient.toBase58(), normalized.recipientAta.toBase58(), normalized.recipientAtaExists ? 1 : 0,
        normalized.amountGtree, normalized.amountBaseUnits.toString(), DISTRIBUTION_SOURCE.mint,
        DISTRIBUTION_SOURCE.sourceWallet, DISTRIBUTION_SOURCE.sourceTokenAccount,
        normalized.allocationCategory, normalized.distributionType, normalized.internalNote,
        normalized.publicDescription, normalized.externalReference, idempotencyKey, requestFingerprint,
        fee.simulationSuccess ? 1 : 0, fee.simulationError, JSON.stringify(fee.logs.slice(0, 20)),
        fee.selectedFeePayer, fee.feePayerAddress, fee.feePayerBalanceLamports?.toString() ?? null,
        fee.estimatedFeeLamports.toString(), fee.estimatedAtaRentLamports.toString(),
        fee.estimatedTotalCostLamports.toString(), fee.messageHash, fee.serverPartialSignaturePresent ? 1 : 0,
        config.dryRun ? 1 : 0, actor.id, now, now, now,
        fee.selectedFeePayer === "CONNECTED_ADMIN" ? now : null, now,
      );
      appendAdminAuditLog(this.database, {
        actorUserId: actor.id, actorEmail: actor.email, actorRole: actor.role,
        action: "TOKEN_DISTRIBUTION_PREVIEW_GENERATED", targetType: "token_distribution", targetId: uuid,
        metadata: { feePayerMode: fee.selectedFeePayer, dryRun: config.dryRun, amountBaseUnits: normalized.amountBaseUnits.toString() },
        createdAt: now,
      });
    });
    return { record: this.get(uuid, actor), dashboard: await this.dashboard(actor) };
  }

  async prepareConnectedWalletSignature(uuid: string, connectedWallet: string, actor: AdminIdentity) {
    requireAdminPermission(actor.role, "token-distributions.confirm");
    if (actor.role !== "OWNER") throw new TokenDistributionError("Only OWNER administrators may confirm token distributions.", "DENIED");
    const record = this.get(uuid, actor);
    const wallet = readPublicKey(connectedWallet, "Connected admin wallet");
    if (record.status !== "previewed" && record.status !== "awaiting_confirmation") {
      throw new TokenDistributionError("This distribution is not ready for wallet signing.", "INVALID_STATE");
    }
    const normalized = await this.normalizeRecord(record);
    const built = await this.buildPreviewTransaction(normalized, readDistributionConfig(), wallet.toBase58(), true);
    if (built.selectedFeePayer !== "CONNECTED_ADMIN" || !built.serializedTransaction) {
      throw new TokenDistributionError("Connected wallet fee payer is not ready.", "FEE_PAYER");
    }
    const now = this.now();
    this.database.db.prepare(`
      UPDATE token_distributions SET status = 'awaiting_confirmation', fee_payer_mode = ?,
        fee_payer_address = ?, fee_payer_balance_lamports_at_preview = ?,
        estimated_fee_lamports = ?, estimated_ata_rent_lamports = ?,
        estimated_total_cost_lamports = ?, transaction_message_hash = ?,
        server_partial_signature_present = 1, admin_wallet_connected_at = ?, updated_at = ?
      WHERE uuid = ?
    `).run(
      built.selectedFeePayer, wallet.toBase58(), built.feePayerBalanceLamports?.toString() ?? null,
      built.estimatedFeeLamports.toString(), built.estimatedAtaRentLamports.toString(),
      built.estimatedTotalCostLamports.toString(), built.messageHash, now, now, uuid,
    );
    appendAdminAuditLog(this.database, {
      actorUserId: actor.id, actorEmail: actor.email, actorRole: actor.role,
      action: "TOKEN_DISTRIBUTION_SENT_TO_ADMIN_WALLET", targetType: "token_distribution", targetId: uuid,
      metadata: { feePayer: wallet.toBase58(), messageHash: built.messageHash }, createdAt: now,
    });
    return { transactionBase64: built.serializedTransaction, messageHash: built.messageHash };
  }

  async submitServerFeePayer(uuid: string, phrase: string, actor: AdminIdentity) {
    requireAdminPermission(actor.role, "token-distributions.confirm");
    this.requireConfirmation(phrase, actor);
    const config = readDistributionConfig();
    if (!config.enabled || config.dryRun) throw new TokenDistributionError("Real transfer submission is disabled.", "DISABLED");
    const record = this.get(uuid, actor);
    const normalized = await this.normalizeRecord(record);
    const built = await this.buildPreviewTransaction(normalized, config, null, true);
    if (built.selectedFeePayer !== "SERVER" || !built.transaction) {
      throw new TokenDistributionError("Server fee payer is not ready.", "FEE_PAYER");
    }
    const signer = readDistributionSigner();
    built.transaction.sign([signer]);
    return this.broadcastOnce(uuid, built.transaction, actor);
  }

  async submitConnectedWallet(uuid: string, phrase: string, signedTransactionBase64: string, actor: AdminIdentity) {
    requireAdminPermission(actor.role, "token-distributions.confirm");
    this.requireConfirmation(phrase, actor);
    const config = readDistributionConfig();
    if (!config.enabled || config.dryRun) throw new TokenDistributionError("Real transfer submission is disabled.", "DISABLED");
    const record = this.get(uuid, actor);
    if (!record.transactionMessageHash) throw new TokenDistributionError("Approved transaction message hash is missing.", "INVALID_STATE");
    const tx = VersionedTransaction.deserialize(Buffer.from(signedTransactionBase64, "base64"));
    const messageHash = hashBytes(tx.message.serialize());
    if (messageHash !== record.transactionMessageHash) {
      throw new TokenDistributionError("Modified transaction rejected.", "MODIFIED_TRANSACTION");
    }
    if (!tx.signatures.some((sig) => sig.some((byte) => byte !== 0))) {
      throw new TokenDistributionError("Missing transaction signatures.", "SIGNATURE");
    }
    const now = this.now();
    this.database.db.prepare(`
      UPDATE token_distributions SET admin_wallet_signature_present = 1,
        signed_transaction_received_at = ?, updated_at = ? WHERE uuid = ?
    `).run(now, now, uuid);
    return this.broadcastOnce(uuid, tx, actor);
  }

  async cancel(uuid: string, actor: AdminIdentity) {
    requireAdminPermission(actor.role, "token-distributions.cancel");
    const record = this.get(uuid, actor);
    if (FINAL_STATES.has(record.status)) throw new TokenDistributionError("Submitted distributions cannot be cancelled.", "INVALID_STATE");
    const now = this.now();
    this.database.db.prepare(`
      UPDATE token_distributions SET status = 'cancelled', cancelled_by_user_id = ?,
        cancelled_at = ?, updated_at = ? WHERE uuid = ?
    `).run(actor.id, now, now, uuid);
    appendAdminAuditLog(this.database, {
      actorUserId: actor.id, actorEmail: actor.email, actorRole: actor.role,
      action: "TOKEN_DISTRIBUTION_CANCELLED", targetType: "token_distribution", targetId: uuid, createdAt: now,
    });
    return this.get(uuid, actor);
  }

  async reconcile(actor?: AdminIdentity) {
    const rows = this.database.db.prepare(`
      SELECT * FROM token_distributions
      WHERE status IN ('processing','submitted','unknown') AND transaction_signature IS NOT NULL
      ORDER BY updated_at ASC LIMIT 50
    `).all() as unknown[];
    let updated = 0;
    for (const row of rows.map(rowToRecord)) {
      const statuses = await this.connection.getSignatureStatuses([row.transactionSignature!], { searchTransactionHistory: true });
      const status = statuses.value[0];
      if (!status) continue;
      const now = this.now();
      if (status.err) {
        this.database.db.prepare("UPDATE token_distributions SET status = 'failed', failure_reason = ?, failed_at = ?, updated_at = ? WHERE uuid = ?")
          .run(JSON.stringify(status.err).slice(0, 500), now, now, row.uuid);
        updated += 1;
      } else if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
        this.database.db.prepare("UPDATE token_distributions SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, ?), updated_at = ? WHERE uuid = ?")
          .run(now, now, row.uuid);
        updated += 1;
      }
    }
    if (actor) {
      appendAdminAuditLog(this.database, {
        actorUserId: actor.id, actorEmail: actor.email, actorRole: actor.role,
        action: "TOKEN_DISTRIBUTION_RECONCILED", targetType: "token_distribution",
        metadata: { updated }, createdAt: this.now(),
      });
    }
    return { checked: rows.length, updated };
  }

  exportCsv(actor: AdminIdentity): string {
    requireAdminPermission(actor.role, "token-distributions.export");
    const rows = this.database.db.prepare("SELECT * FROM token_distributions ORDER BY created_at DESC LIMIT 10000").all() as unknown[];
    return [
      ["uuid", "created_at", "recipient_wallet", "amount_gtree", "status", "signature", "category", "distribution_type", "external_reference"],
      ...rows.map((row) => {
        const item = rowToRecord(row);
        return [
          item.uuid, new Date(item.createdAt).toISOString(), item.recipientWalletAddress,
          item.amountGtree, item.status, item.transactionSignature ?? "",
          item.allocationCategory, item.distributionType, item.externalReference ?? "",
        ];
      }),
    ].map((cols) => cols.map(csvCell).join(",")).join("\r\n");
  }

  private async normalizeInput(input: PreviewInput, config: DistributionConfig, source: DistributionDashboard["source"]) {
    const recipient = readPublicKey(input.recipientWalletAddress, "Recipient wallet");
    if (recipient.equals(PublicKey.default)) throw new TokenDistributionError("Recipient cannot be the default system address.");
    if (recipient.toBase58() === DISTRIBUTION_SOURCE.mint) throw new TokenDistributionError("Recipient cannot be the GTREE mint address.");
    if (recipient.toBase58() === DISTRIBUTION_SOURCE.sourceTokenAccount) throw new TokenDistributionError("Recipient cannot be the source token account.");
    const amount = parseGtreeAmount(input.amountGtree);
    if (config.maxPerTransferBaseUnits !== null && amount.baseUnits > config.maxPerTransferBaseUnits) {
      throw new TokenDistributionError("Amount exceeds the configured per-transfer limit.");
    }
    if (amount.baseUnits > BigInt(source.sourceBalanceBaseUnits)) throw new TokenDistributionError("Insufficient GTREE source balance.");
    const category = boundedChoice(input.allocationCategory, CATEGORIES, "allocation category");
    const distributionType = boundedChoice(input.distributionType, TYPES, "distribution type");
    const recipientAta = getAssociatedTokenAddressSync(new PublicKey(DISTRIBUTION_SOURCE.mint), recipient);
    const info = await this.connection.getAccountInfo(recipientAta, "confirmed");
    await this.enforceDailyLimit(amount.baseUnits, config);
    return {
      recipient,
      recipientAta,
      recipientAtaExists: Boolean(info),
      amountGtree: amount.normalized,
      amountBaseUnits: amount.baseUnits,
      allocationCategory: category,
      distributionType,
      internalNote: optionalText(input.internalNote, 2_000),
      publicDescription: optionalText(input.publicDescription, 500),
      externalReference: optionalText(input.externalReference, 200),
    };
  }

  private async normalizeRecord(record: DistributionRecord) {
    return {
      recipient: new PublicKey(record.recipientWalletAddress),
      recipientAta: new PublicKey(record.recipientTokenAccount),
      recipientAtaExists: record.recipientTokenAccountExisted,
      amountGtree: record.amountGtree,
      amountBaseUnits: BigInt(record.amountBaseUnits),
      allocationCategory: record.allocationCategory as DistributionCategory,
      distributionType: record.distributionType as DistributionType,
      internalNote: record.internalNote,
      publicDescription: record.publicDescription,
      externalReference: record.externalReference,
    };
  }

  private async buildPreviewTransaction(
    normalized: Awaited<ReturnType<TokenDistributionService["normalizeInput"]>>,
    config: DistributionConfig,
    connectedFeePayerAddress: string | null,
    requireReadyFeePayer: boolean,
  ) {
    const source = await this.verifySource();
    const mint = new PublicKey(DISTRIBUTION_SOURCE.mint);
    const sourceTokenAccount = new PublicKey(DISTRIBUTION_SOURCE.sourceTokenAccount);
    const delegateSigner = new PublicKey(DISTRIBUTION_SOURCE.delegateSigner);
    const connectedFeePayer = connectedFeePayerAddress ? readPublicKey(connectedFeePayerAddress, "Connected fee payer") : null;
    const ataRent = normalized.recipientAtaExists
      ? 0n
      : BigInt(await this.connection.getMinimumBalanceForRentExemption(165, "confirmed"));
    const serverBalance = BigInt(source.serverSignerSolLamports);
    const connectedBalance = connectedFeePayer ? BigInt(await this.connection.getBalance(connectedFeePayer, "confirmed")) : null;
    const preliminaryFeePayer = chooseFeePayer(config, serverBalance, connectedFeePayer, connectedBalance, ataRent, 5_000n);
    const feePayerPublicKey = preliminaryFeePayer === "CONNECTED_ADMIN" && connectedFeePayer
      ? connectedFeePayer
      : delegateSigner;
    const instructions = [
      ...(!normalized.recipientAtaExists ? [
        createAssociatedTokenAccountIdempotentInstruction(
          feePayerPublicKey,
          normalized.recipientAta,
          normalized.recipient,
          mint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      ] : []),
      createTransferCheckedInstruction(
        sourceTokenAccount,
        mint,
        normalized.recipientAta,
        delegateSigner,
        normalized.amountBaseUnits,
        DISTRIBUTION_SOURCE.decimals,
      ),
    ];
    const blockhash = await this.connection.getLatestBlockhash("confirmed");
    const message = new TransactionMessage({
      payerKey: feePayerPublicKey,
      recentBlockhash: blockhash.blockhash,
      instructions,
    }).compileToV0Message();
    const estimatedFeeLamports = BigInt((await this.connection.getFeeForMessage(message, "confirmed")).value ?? 5_000);
    const totalCost = estimatedFeeLamports + ataRent + config.feeSafetyMarginLamports;
    const selectedFeePayer = chooseFeePayer(config, serverBalance, connectedFeePayer, connectedBalance, ataRent, estimatedFeeLamports);
    if (requireReadyFeePayer && selectedFeePayer === "WAITING") {
      throw new TokenDistributionError("Waiting for a fee payer.", "FEE_PAYER");
    }
    const transaction = new VersionedTransaction(message);
    let simulationSuccess = false;
    let simulationError: string | null = null;
    let logs: string[] = [];
    let serializedTransaction: string | null = null;
    let serverPartialSignaturePresent = false;
    if (selectedFeePayer === "CONNECTED_ADMIN") {
      const signer = readDistributionSigner();
      transaction.sign([signer]);
      serverPartialSignaturePresent = true;
      serializedTransaction = Buffer.from(transaction.serialize()).toString("base64");
    }
    try {
      const sim = await this.connection.simulateTransaction(transaction, { sigVerify: false, commitment: "confirmed" });
      simulationSuccess = !sim.value.err;
      simulationError = sim.value.err ? JSON.stringify(sim.value.err).slice(0, 500) : null;
      logs = (sim.value.logs ?? []).map((item) => item.slice(0, 500));
    } catch (error) {
      simulationError = error instanceof Error ? error.message.slice(0, 500) : "Simulation failed.";
    }
    return {
      transaction,
      serializedTransaction,
      messageHash: hashBytes(message.serialize()),
      selectedFeePayer,
      feePayerAddress: feePayerPublicKey.toBase58(),
      feePayerBalanceLamports: selectedFeePayer === "CONNECTED_ADMIN" ? connectedBalance : serverBalance,
      estimatedFeeLamports,
      estimatedAtaRentLamports: ataRent,
      estimatedTotalCostLamports: totalCost,
      simulationSuccess,
      simulationError,
      logs,
      serverPartialSignaturePresent,
    };
  }

  private async verifySource(): Promise<DistributionDashboard["source"]> {
    const errors: string[] = [];
    let rpcStatus: "ready" | "error" = "ready";
    let sourceBalance = 0n;
    let delegatedAmount = 0n;
    let sourceSol = 0;
    let signerSol = 0;
    let signerIsDelegate = false;
    let tokenAccountValid = false;
    let signerConfigured = false;
    let signerMatchesExpected = false;
    try {
      const [account, mint, sourceLamports, signerLamports] = await Promise.all([
        getAccount(this.connection, new PublicKey(DISTRIBUTION_SOURCE.sourceTokenAccount), "confirmed"),
        getMint(this.connection, new PublicKey(DISTRIBUTION_SOURCE.mint), "confirmed"),
        this.connection.getBalance(new PublicKey(DISTRIBUTION_SOURCE.sourceWallet), "confirmed"),
        this.connection.getBalance(new PublicKey(DISTRIBUTION_SOURCE.delegateSigner), "confirmed"),
      ]);
      sourceBalance = account.amount;
      delegatedAmount = account.delegatedAmount;
      sourceSol = sourceLamports;
      signerSol = signerLamports;
      signerIsDelegate = account.delegate?.toBase58() === DISTRIBUTION_SOURCE.delegateSigner;
      tokenAccountValid = account.mint.toBase58() === DISTRIBUTION_SOURCE.mint
        && account.owner.toBase58() === DISTRIBUTION_SOURCE.sourceWallet
        && mint.decimals === DISTRIBUTION_SOURCE.decimals
        && !account.isFrozen;
      if (!tokenAccountValid) errors.push("Configured source token account does not match the official GTREE source.");
      if (!signerIsDelegate) errors.push("Configured signer is not the active SPL delegate.");
      if (delegatedAmount <= 0n) errors.push("Configured signer has no delegated GTREE allowance.");
    } catch (error) {
      rpcStatus = "error";
      errors.push(error instanceof Error ? error.message : "Solana RPC verification failed.");
    }
    try {
      const signer = readDistributionSigner();
      signerConfigured = true;
      signerMatchesExpected = signer.publicKey.toBase58() === DISTRIBUTION_SOURCE.delegateSigner;
      if (!signerMatchesExpected) errors.push("Configured distribution signer does not match expected delegate signer.");
    } catch {
      errors.push("Distribution signer is not configured or readable.");
    }
    return {
      mint: DISTRIBUTION_SOURCE.mint,
      sourceWallet: DISTRIBUTION_SOURCE.sourceWallet,
      sourceTokenAccount: DISTRIBUTION_SOURCE.sourceTokenAccount,
      delegateSigner: DISTRIBUTION_SOURCE.delegateSigner,
      sourceBalanceBaseUnits: sourceBalance.toString(),
      sourceBalanceGtree: atomicToDecimal(sourceBalance, DISTRIBUTION_SOURCE.decimals),
      delegatedAmountBaseUnits: delegatedAmount.toString(),
      sourceSolLamports: String(sourceSol),
      sourceSol: (sourceSol / LAMPORTS_PER_SOL).toString(),
      serverSignerSolLamports: String(signerSol),
      serverSignerSol: (signerSol / LAMPORTS_PER_SOL).toString(),
      signerIsDelegate,
      signerConfigured,
      signerMatchesExpected,
      tokenAccountValid,
      rpcStatus,
      configurationErrors: errors,
    };
  }

  private async stats(): Promise<DistributionDashboard["stats"]> {
    const now = new Date(this.now());
    const startDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const startMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const countable = "('processing','submitted','confirmed','unknown')";
    const totalToday = sumBaseUnits(this.database, `created_at >= ${startDay} AND status IN ${countable}`);
    const totalMonth = sumBaseUnits(this.database, `created_at >= ${startMonth} AND status IN ${countable}`);
    const daily = readDistributionConfig().dailyLimitBaseUnits;
    const counts = this.database.db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
        SUM(CASE WHEN status IN ('processing','submitted','unknown','awaiting_confirmation') THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
        MAX(CASE WHEN status = 'confirmed' THEN confirmed_at ELSE NULL END) AS last_success
      FROM token_distributions
    `).get() as { confirmed: number | null; pending: number | null; failed: number | null; last_success: number | null };
    return {
      totalSentTodayBaseUnits: totalToday.toString(),
      totalSentMonthBaseUnits: totalMonth.toString(),
      confirmedTransfers: Number(counts.confirmed ?? 0),
      pendingTransfers: Number(counts.pending ?? 0),
      failedTransfers: Number(counts.failed ?? 0),
      dailyRemainingBaseUnits: daily === null ? null : (daily - totalToday > 0n ? daily - totalToday : 0n).toString(),
      lastSuccessfulTransferAt: counts.last_success,
    };
  }

  private configView() {
    const config = readDistributionConfig();
    return {
      enabled: config.enabled,
      dryRun: config.dryRun,
      feePayerMode: config.feePayerMode,
      allowConnectedAdminFeePayer: config.allowConnectedAdminFeePayer,
      minSolBalanceLamports: config.minSolBalanceLamports.toString(),
      feeSafetyMarginLamports: config.feeSafetyMarginLamports.toString(),
      maxPerTransferBaseUnits: config.maxPerTransferBaseUnits?.toString() ?? null,
      dailyLimitBaseUnits: config.dailyLimitBaseUnits?.toString() ?? null,
    };
  }

  private async enforceDailyLimit(amount: bigint, config: DistributionConfig) {
    if (config.dailyLimitBaseUnits === null) return;
    const now = new Date(this.now());
    const startDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const used = sumBaseUnits(this.database, `created_at >= ${startDay} AND status IN ('processing','submitted','confirmed','unknown')`);
    if (used + amount > config.dailyLimitBaseUnits) throw new TokenDistributionError("Daily distribution limit exceeded.");
  }

  private requireConfirmation(phrase: string, actor: AdminIdentity) {
    const config = readDistributionConfig();
    if (actor.role !== "OWNER") throw new TokenDistributionError("Only OWNER administrators may confirm token distributions.", "DENIED");
    if (phrase !== config.confirmationPhrase) throw new TokenDistributionError(`Type "${config.confirmationPhrase}" to confirm.`, "CONFIRMATION");
  }

  private async broadcastOnce(uuid: string, tx: VersionedTransaction, actor: AdminIdentity) {
    const signature = tx.signatures[0] ? bs58Encode(tx.signatures[0]) : null;
    if (!signature) throw new TokenDistributionError("Unable to derive transaction signature.", "SIGNATURE");
    const now = this.now();
    this.database.transaction(() => {
      const current = this.database.db.prepare("SELECT status, transaction_signature FROM token_distributions WHERE uuid = ?").get(uuid) as { status: string; transaction_signature: string | null };
      if (current.transaction_signature) throw new TokenDistributionError("Transfer already has a saved signature.", "DUPLICATE");
      this.database.db.prepare(`
        UPDATE token_distributions SET status = 'processing', transaction_signature = ?,
          processing_started_at = ?, updated_at = ? WHERE uuid = ?
      `).run(signature, now, now, uuid);
    });
    try {
      await this.connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 0 });
      this.database.db.prepare("UPDATE token_distributions SET status = 'submitted', submitted_at = ?, updated_at = ? WHERE uuid = ?")
        .run(this.now(), this.now(), uuid);
      appendAdminAuditLog(this.database, {
        actorUserId: actor.id, actorEmail: actor.email, actorRole: actor.role,
        action: "TOKEN_DISTRIBUTION_TRANSACTION_BROADCAST", targetType: "token_distribution", targetId: uuid,
        metadata: { signature }, createdAt: this.now(),
      });
      return this.get(uuid, actor);
    } catch (error) {
      this.database.db.prepare("UPDATE token_distributions SET status = 'unknown', failure_reason = ?, updated_at = ? WHERE uuid = ?")
        .run(error instanceof Error ? error.message.slice(0, 500) : "Broadcast status is unknown.", this.now(), uuid);
      return this.get(uuid, actor);
    }
  }
}

export function readDistributionConfig(environment: Partial<NodeJS.ProcessEnv> = process.env): DistributionConfig {
  return {
    enabled: environment.GTREE_DISTRIBUTION_ENABLED === "true",
    dryRun: environment.GTREE_DISTRIBUTION_DRY_RUN !== "false",
    feePayerMode: parseFeePayerMode(environment.GTREE_DISTRIBUTION_FEE_PAYER_MODE),
    allowConnectedAdminFeePayer: environment.GTREE_DISTRIBUTION_ALLOW_CONNECTED_ADMIN_FEE_PAYER !== "false",
    maxPerTransferBaseUnits: optionalBigint(environment.GTREE_DISTRIBUTION_MAX_PER_TRANSFER),
    dailyLimitBaseUnits: optionalBigint(environment.GTREE_DISTRIBUTION_DAILY_LIMIT),
    minSolBalanceLamports: optionalBigint(environment.GTREE_DISTRIBUTION_MIN_SOL_BALANCE) ?? 0n,
    feeSafetyMarginLamports: optionalBigint(environment.GTREE_DISTRIBUTION_FEE_SAFETY_MARGIN_LAMPORTS) ?? 10_000n,
    confirmationPhrase: environment.GTREE_DISTRIBUTION_CONFIRMATION_PHRASE || "CONFIRM TRANSFER",
  };
}

export function parseGtreeAmount(value: string): { normalized: string; baseUnits: bigint } {
  const text = value.trim();
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(text)) throw new TokenDistributionError("Enter a valid decimal GTREE amount.");
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > DISTRIBUTION_SOURCE.decimals) throw new TokenDistributionError("GTREE supports at most 9 decimal places.");
  const baseUnits = BigInt(whole) * 1_000_000_000n + BigInt((fraction + "0".repeat(9)).slice(0, 9));
  if (baseUnits <= 0n) throw new TokenDistributionError("Amount must be greater than zero.");
  return { normalized: atomicToDecimal(baseUnits, 9), baseUnits };
}

function readDistributionSigner(environment: NodeJS.ProcessEnv = process.env): Keypair {
  const explicit = environment.GTREE_DISTRIBUTION_KEYPAIR_PATH?.trim();
  const fallback = environment.FOUNDATION_DIRECT_SALE_SIGNER_KEYPAIR_PATH?.trim();
  const keypairPath = explicit || fallback;
  if (!keypairPath) throw new TokenDistributionError("Distribution signer keypair is not configured.", "CONFIGURATION");
  const resolvedPath = path.resolve(keypairPath);
  if (resolvedPath.startsWith(path.resolve(process.cwd()))) {
    throw new TokenDistributionError("Distribution signer keypair must be outside the repository.", "CONFIGURATION");
  }
  const secret = JSON.parse(fs.readFileSync(resolvedPath, "utf8")) as unknown;
  if (!Array.isArray(secret) || secret.length !== 64) throw new TokenDistributionError("Distribution signer keypair is invalid.", "CONFIGURATION");
  const signer = Keypair.fromSecretKey(Uint8Array.from(secret as number[]));
  if (signer.publicKey.toBase58() !== DISTRIBUTION_SOURCE.delegateSigner) {
    throw new TokenDistributionError("Distribution signer does not match the expected delegate.", "CONFIGURATION");
  }
  return signer;
}

function distributionRpcUrl() {
  return process.env.GTREE_DISTRIBUTION_RPC_URL?.trim() || SERVER_ENV.solanaRpcUrl;
}

function distributionCommitment(): "confirmed" | "finalized" | "processed" {
  const value = process.env.GTREE_DISTRIBUTION_COMMITMENT;
  return value === "processed" || value === "finalized" ? value : "confirmed";
}

function parseFeePayerMode(value: string | undefined): FeePayerMode {
  if (value === "SERVER_ONLY" || value === "CONNECTED_ADMIN_ONLY") return value;
  return "AUTO";
}

function optionalBigint(value: string | undefined): bigint | null {
  const text = value?.trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) throw new TokenDistributionError("Distribution numeric config must be an integer string.", "CONFIGURATION");
  return BigInt(text);
}

function chooseFeePayer(
  config: DistributionConfig,
  serverBalance: bigint,
  connected: PublicKey | null,
  connectedBalance: bigint | null,
  ataRent: bigint,
  fee: bigint,
): SelectedFeePayer {
  const required = fee + ataRent + config.feeSafetyMarginLamports + config.minSolBalanceLamports;
  const serverReady = serverBalance >= required;
  const connectedReady = connected && connectedBalance !== null && connectedBalance >= required;
  if (config.feePayerMode === "SERVER_ONLY") return serverReady ? "SERVER" : "WAITING";
  if (config.feePayerMode === "CONNECTED_ADMIN_ONLY") return config.allowConnectedAdminFeePayer && connectedReady ? "CONNECTED_ADMIN" : "WAITING";
  if (serverReady) return "SERVER";
  return config.allowConnectedAdminFeePayer && connectedReady ? "CONNECTED_ADMIN" : "WAITING";
}

function serverReady(source: DistributionDashboard["source"], config: DistributionConfig, estimatedCost: bigint) {
  return source.configurationErrors.length === 0
    && BigInt(source.serverSignerSolLamports) >= estimatedCost + config.minSolBalanceLamports + config.feeSafetyMarginLamports;
}

function readPublicKey(value: string, label: string): PublicKey {
  try {
    return new PublicKey(value.trim());
  } catch {
    throw new TokenDistributionError(`${label} must be a valid Solana public key.`);
  }
}

function boundedChoice<T extends readonly string[]>(value: string, choices: T, label: string): T[number] {
  if (!choices.includes(value)) throw new TokenDistributionError(`Invalid ${label}.`);
  return value as T[number];
}

function optionalText(value: string | undefined, max: number): string | null {
  const text = value?.trim();
  return text ? text.slice(0, max) : null;
}

function atomicToDecimal(value: bigint, decimals: number): string {
  const raw = value.toString().padStart(decimals + 1, "0");
  const whole = raw.slice(0, -decimals);
  const fraction = raw.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function rowToRecord(value: unknown): DistributionRecord {
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
  };
}

function sumBaseUnits(database: AdminDatabase, where: string): bigint {
  const row = database.db.prepare(`SELECT amount_base_units FROM token_distributions WHERE ${where}`).all() as Array<{ amount_base_units: string }>;
  return row.reduce((sum, item) => sum + BigInt(item.amount_base_units), 0n);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, "\"\"")}"`;
}

function bs58Encode(bytes: Uint8Array): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
  let out = "";
  while (n > 0n) {
    const mod = Number(n % 58n);
    out = alphabet[mod] + out;
    n /= 58n;
  }
  for (const byte of bytes) {
    if (byte === 0) out = "1" + out;
    else break;
  }
  return out || "1";
}
