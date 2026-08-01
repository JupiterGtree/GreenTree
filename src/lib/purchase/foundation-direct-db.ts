/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import * as fs from "node:fs";
import * as path from "node:path";
import { PublicKey } from "@solana/web3.js";
import type { FoundationSaleControlStore } from "./foundation-direct";

// @ts-expect-error node:sqlite is present in Node 22.5.0+ but might be missing in Node 20 types
import { DatabaseSync } from "node:sqlite";

export interface DbQuote {
  quoteId: string;
  buyer: string;
  inputLamports: bigint;
  outputTokenUnits: bigint;
  expiresAt: number;
  status: "CREATED" | "BUILT" | "SUBMITTED" | "CONFIRMED" | "EXPIRED" | "FAILED";
  txSignature: string | null;
  createdAt: number;
  updatedAt: number;

  // Rich metadata
  orderId?: string | null;
  buyerPublicKey?: string | null;
  treasuryRecipient?: string | null;
  gtreeMint?: string | null;
  saleTokenAccount?: string | null;
  saleSignerPublicKey?: string | null;
  quoteCreatedAt?: number | null;
  quoteExpiresAt?: number | null;
  serializedTransaction?: string | null;
  transactionMessageHash?: string | null;
  lastValidBlockHeight?: number | null;
  submittedAt?: number | null;
  confirmedAt?: number | null;
  failedAt?: number | null;
  failureReason?: string | null;
  quoteSolPriceUsd?: string | null;
  quoteInputUsd?: string | null;
}

export interface WalletPurchaseRecord {
  purchaseId: string;
  wallet: string;
  solLamports: string;
  gtreeTokenUnits: string;
  status: DbQuote["status"];
  transactionSignature: string | null;
  createdAt: number;
  updatedAt: number;
  confirmedAt: number | null;
}

export interface WalletPurchaseHistory {
  items: WalletPurchaseRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface WalletPurchaseSummary {
  wallet: string;
  confirmedGtreeTokenUnits: string;
  confirmedSolLamports: string;
  confirmedPurchaseCount: number;
  pendingPurchaseCount: number;
  latestConfirmedPurchases: WalletPurchaseRecord[];
}

export class SQLiteFoundationSaleControlStore implements FoundationSaleControlStore {
  private db: any;

  constructor(dbName: string = "foundation-sale.db") {
    const dirPath = path.resolve(process.cwd(), "data");
    fs.mkdirSync(dirPath, { recursive: true });
    const dbPath = path.join(dirPath, dbName);
    
    this.db = new DatabaseSync(dbPath);
    this.hardenConnection();
    this.initSchema();
  }

  private hardenConnection() {
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec("PRAGMA foreign_keys = ON;");

    try {
      const journalMode = this.db.prepare("PRAGMA journal_mode;").get() as any;
      const synchronous = this.db.prepare("PRAGMA synchronous;").get() as any;
      const busyTimeout = this.db.prepare("PRAGMA busy_timeout;").get() as any;
      const foreignKeys = this.db.prepare("PRAGMA foreign_keys;").get() as any;
      console.log(
        `[SQLITE INIT] journal_mode=${journalMode?.journal_mode}, synchronous=${synchronous?.synchronous}, busy_timeout=${busyTimeout?.busy_timeout}, foreign_keys=${foreignKeys?.foreign_keys}`
      );
    } catch (err: any) {
      console.warn(`[SQLITE INIT WARNING] Failed to read pragmas: ${err.message}`);
    }
  }

  private initSchema() {
    // 1. Quotes Table (Basic backwards-compatible definition)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS quotes (
        quote_id TEXT PRIMARY KEY,
        buyer TEXT NOT NULL,
        input_lamports TEXT NOT NULL,
        output_token_units TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        tx_signature TEXT UNIQUE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Perform safe, backwards-compatible schema upgrades
    const optionalColumns = [
      { name: "order_id", type: "TEXT" },
      { name: "buyer_public_key", type: "TEXT" },
      { name: "treasury_recipient", type: "TEXT" },
      { name: "gtree_mint", type: "TEXT" },
      { name: "sale_token_account", type: "TEXT" },
      { name: "sale_signer_public_key", type: "TEXT" },
      { name: "quote_created_at", type: "INTEGER" },
      { name: "quote_expires_at", type: "INTEGER" },
      { name: "serialized_transaction", type: "TEXT" },
      { name: "transaction_message_hash", type: "TEXT" },
      { name: "last_valid_block_height", type: "INTEGER" },
      { name: "submitted_at", type: "INTEGER" },
      { name: "confirmed_at", type: "INTEGER" },
      { name: "failed_at", type: "INTEGER" },
      { name: "failure_reason", type: "TEXT" },
      { name: "quote_sol_price_usd", type: "TEXT" },
      { name: "quote_input_usd", type: "TEXT" },
    ];

    for (const col of optionalColumns) {
      try {
        this.db.exec(`ALTER TABLE quotes ADD COLUMN ${col.name} ${col.type}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/duplicate column name|column .* already exists/i.test(message)) {
          throw new Error(`SQLite migration failed while adding ${col.name}: ${message}`, { cause: error });
        }
      }
    }

    // 2. Issued Transactions Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS issued_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet TEXT NOT NULL,
        token_units TEXT NOT NULL,
        issued_at_ms INTEGER NOT NULL
      )
    `);

    // 3. Price Observations Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS price_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        price_gtree_per_sol TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    // 4. Cooldown Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cooldown (
        key TEXT PRIMARY KEY,
        value INTEGER NOT NULL
      )
    `);
  }

  // --- FoundationSaleControlStore Implementation ---

  async getWalletTokenUnitsIssued(wallet: PublicKey, periodSeconds: number, nowMs: number): Promise<bigint> {
    const cutoff = nowMs - periodSeconds * 1000;
    const walletStr = wallet.toBase58();
    const query = this.db.prepare(`
      SELECT token_units FROM issued_transactions 
      WHERE wallet = ? AND issued_at_ms >= ?
    `);
    const rows = query.all(walletStr, cutoff) as any[];
    return rows.reduce((sum, row) => sum + BigInt(row.token_units), 0n);
  }

  async getDailyTokenUnitsIssued(nowMs: number): Promise<bigint> {
    const dayStart = this.startOfUtcDay(nowMs);
    const query = this.db.prepare(`
      SELECT token_units FROM issued_transactions 
      WHERE issued_at_ms >= ?
    `);
    const rows = query.all(dayStart) as any[];
    return rows.reduce((sum, row) => sum + BigInt(row.token_units), 0n);
  }

  async recordIssuedTransaction(wallet: PublicKey, tokenUnits: bigint, nowMs: number): Promise<void> {
    const walletStr = wallet.toBase58();
    const unitsStr = tokenUnits.toString();
    const insert = this.db.prepare(`
      INSERT INTO issued_transactions (wallet, token_units, issued_at_ms)
      VALUES (?, ?, ?)
    `);
    insert.run(walletStr, unitsStr, nowMs);

    // Clean up older records (older than 48 hours)
    const cutoff = nowMs - 48 * 60 * 60 * 1000;
    const cleanup = this.db.prepare(`
      DELETE FROM issued_transactions WHERE issued_at_ms < ?
    `);
    cleanup.run(cutoff);
  }

  async getQuoteState(quoteId: string): Promise<"ISSUED" | "CONSUMED" | "EXPIRED" | null> {
    const query = this.db.prepare(`
      SELECT status FROM quotes WHERE quote_id = ?
    `);
    const row = query.get(quoteId) as any;
    if (!row) return null;

    const status = row.status;
    if (status === "CONFIRMED" || status === "SUBMITTED" || status === "BUILT" || status === "CONSUMED") {
      return "CONSUMED";
    }
    if (status === "EXPIRED") {
      return "EXPIRED";
    }
    return "ISSUED";
  }

  async setQuoteState(quoteId: string, state: "ISSUED" | "CONSUMED" | "EXPIRED"): Promise<void> {
    const internalStatus = state === "CONSUMED" ? "SUBMITTED" : state;
    const now = Date.now();
    const update = this.db.prepare(`
      UPDATE quotes SET status = ?, updated_at = ? WHERE quote_id = ?
    `);
    update.run(internalStatus, now, quoteId);
  }

  async getPriceObservations(): Promise<Array<{ priceGtreePerSol: string; timestamp: number }>> {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    this.db.prepare(`
      DELETE FROM price_observations WHERE timestamp < ?
    `).run(cutoff);
    const query = this.db.prepare(`
      SELECT price_gtree_per_sol, timestamp FROM price_observations
      WHERE timestamp >= ?
      ORDER BY timestamp ASC
    `);
    const rows = query.all(cutoff) as any[];
    return rows.map(r => ({
      priceGtreePerSol: r.price_gtree_per_sol,
      timestamp: r.timestamp
    }));
  }

  async recordPriceObservation(priceGtreePerSol: string, timestamp: number): Promise<void> {
    const insert = this.db.prepare(`
      INSERT INTO price_observations (price_gtree_per_sol, timestamp)
      VALUES (?, ?)
    `);
    insert.run(priceGtreePerSol, timestamp);

    // Clean up older observations (older than 2 hours)
    const cutoff = timestamp - 2 * 60 * 60 * 1000;
    const cleanup = this.db.prepare(`
      DELETE FROM price_observations WHERE timestamp < ?
    `);
    cleanup.run(cutoff);
  }

  async getCooldownUntil(): Promise<number> {
    const query = this.db.prepare(`
      SELECT value FROM cooldown WHERE key = 'cooldown_until'
    `);
    const row = query.get() as any;
    return row ? row.value : 0;
  }

  async setCooldownUntil(timestamp: number): Promise<void> {
    const insert = this.db.prepare(`
      INSERT INTO cooldown (key, value) VALUES ('cooldown_until', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    insert.run(timestamp);
  }

  // --- Extended Methods for Rich Statuses, Replay & State Transitions ---

  async createQuote(
    quoteId: string,
    buyer: string,
    inputLamports: bigint,
    outputTokenUnits: bigint,
    expiresAt: number,
    metadata: {
      orderId?: string;
      buyerPublicKey?: string;
      treasuryRecipient?: string;
      gtreeMint?: string;
      saleTokenAccount?: string;
      saleSignerPublicKey?: string;
      quoteCreatedAt?: number;
      quoteExpiresAt?: number;
      quoteSolPriceUsd?: number | null;
      quoteInputUsd?: number | null;
    } = {}
  ): Promise<void> {
    const now = Date.now();
    const insert = this.db.prepare(`
      INSERT INTO quotes (
        quote_id, buyer, input_lamports, output_token_units, expires_at, status, created_at, updated_at,
        order_id, buyer_public_key, treasury_recipient, gtree_mint, sale_token_account, sale_signer_public_key,
        quote_created_at, quote_expires_at, quote_sol_price_usd, quote_input_usd
      )
      VALUES (?, ?, ?, ?, ?, 'CREATED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      quoteId,
      buyer,
      inputLamports.toString(),
      outputTokenUnits.toString(),
      expiresAt,
      now,
      now,
      metadata.orderId || null,
      metadata.buyerPublicKey || null,
      metadata.treasuryRecipient || null,
      metadata.gtreeMint || null,
      metadata.saleTokenAccount || null,
      metadata.saleSignerPublicKey || null,
      metadata.quoteCreatedAt || null,
      metadata.quoteExpiresAt || null,
      finiteDecimal(metadata.quoteSolPriceUsd),
      finiteDecimal(metadata.quoteInputUsd)
    );
  }

  async getQuote(quoteId: string): Promise<DbQuote | null> {
    const query = this.db.prepare(`
      SELECT quote_id, buyer, input_lamports, output_token_units, expires_at, status, tx_signature, created_at, updated_at,
             order_id, buyer_public_key, treasury_recipient, gtree_mint, sale_token_account, sale_signer_public_key,
             quote_created_at, quote_expires_at, serialized_transaction, transaction_message_hash, last_valid_block_height,
             submitted_at, confirmed_at, failed_at, failure_reason, quote_sol_price_usd, quote_input_usd
      FROM quotes WHERE quote_id = ?
    `);
    const row = query.get(quoteId) as any;
    if (!row) return null;

    // Map legacy CONSUMED status to BUILT when reading
    let status = row.status;
    if (status === "CONSUMED") {
      status = "BUILT";
    }

    return {
      quoteId: row.quote_id,
      buyer: row.buyer,
      inputLamports: BigInt(row.input_lamports),
      outputTokenUnits: BigInt(row.output_token_units),
      expiresAt: row.expires_at,
      status: status as any,
      txSignature: row.tx_signature,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      orderId: row.order_id,
      buyerPublicKey: row.buyer_public_key,
      treasuryRecipient: row.treasury_recipient,
      gtreeMint: row.gtree_mint,
      saleTokenAccount: row.sale_token_account,
      saleSignerPublicKey: row.sale_signer_public_key,
      quoteCreatedAt: row.quote_created_at,
      quoteExpiresAt: row.quote_expires_at,
      serializedTransaction: row.serialized_transaction,
      transactionMessageHash: row.transaction_message_hash,
      lastValidBlockHeight: row.last_valid_block_height ? Number(row.last_valid_block_height) : null,
      submittedAt: row.submitted_at ? Number(row.submitted_at) : null,
      confirmedAt: row.confirmed_at ? Number(row.confirmed_at) : null,
      failedAt: row.failed_at ? Number(row.failed_at) : null,
      failureReason: row.failure_reason,
      quoteSolPriceUsd: row.quote_sol_price_usd,
      quoteInputUsd: row.quote_input_usd
    };
  }

  async transitionQuoteStatus(
    quoteId: string,
    fromStates: string[],
    toStatus: "CREATED" | "BUILT" | "SUBMITTED" | "CONFIRMED" | "EXPIRED" | "FAILED",
    extraFields: Record<string, any> = {}
  ): Promise<boolean> {
    const now = Date.now();
    const sets = ["status = ?", "updated_at = ?"];
    const params: any[] = [toStatus, now];

    for (const [key, val] of Object.entries(extraFields)) {
      sets.push(`${key} = ?`);
      if (typeof val === "bigint") {
        params.push(val.toString());
      } else {
        params.push(val);
      }
    }

    params.push(quoteId);

    // Build state check placeholders
    const statePlaceholders = fromStates.map(() => "?").join(", ");
    params.push(...fromStates);

    const sql = `
      UPDATE quotes 
      SET ${sets.join(", ")} 
      WHERE quote_id = ? 
      AND status IN (${statePlaceholders})
    `;

    const update = this.db.prepare(sql);
    const result = update.run(...params);
    return result.changes > 0;
  }

  async confirmQuoteAndRecordIssued(
    quoteId: string,
    wallet: PublicKey,
    tokenUnits: bigint,
    confirmedAtMs: number,
  ): Promise<boolean> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const transition = this.db.prepare(`
        UPDATE quotes
        SET status = 'CONFIRMED', confirmed_at = ?, updated_at = ?
        WHERE quote_id = ? AND status = 'SUBMITTED'
      `).run(confirmedAtMs, confirmedAtMs, quoteId);
      if (transition.changes === 0) {
        this.db.exec("ROLLBACK");
        return false;
      }

      this.db.prepare(`
        INSERT INTO issued_transactions (wallet, token_units, issued_at_ms)
        VALUES (?, ?, ?)
      `).run(wallet.toBase58(), tokenUnits.toString(), confirmedAtMs);
      this.db.prepare("DELETE FROM issued_transactions WHERE issued_at_ms < ?")
        .run(confirmedAtMs - 48 * 60 * 60 * 1000);
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* Transaction may already be closed. */ }
      throw error;
    }
  }

  async updateQuoteStatus(
    quoteId: string,
    status: "CREATED" | "BUILT" | "SUBMITTED" | "CONFIRMED" | "EXPIRED" | "FAILED",
    txSignature?: string | null
  ): Promise<void> {
    const now = Date.now();
    if (txSignature !== undefined) {
      const update = this.db.prepare(`
        UPDATE quotes SET status = ?, tx_signature = ?, updated_at = ? WHERE quote_id = ?
      `);
      update.run(status, txSignature, now, quoteId);
    } else {
      const update = this.db.prepare(`
        UPDATE quotes SET status = ?, updated_at = ? WHERE quote_id = ?
      `);
      update.run(status, now, quoteId);
    }
  }

  /** Read-only wallet-scoped purchase history. The wallet predicate is exact. */
  getWalletPurchaseHistory(wallet: string, options: { page?: number; pageSize?: number } = {}): WalletPurchaseHistory {
    const normalizedWallet = wallet.trim();
    const page = boundedInteger(options.page, 1, 1, 100_000);
    const pageSize = boundedInteger(options.pageSize, 10, 1, 50);
    const total = Number((this.db.prepare("SELECT COUNT(*) AS count FROM quotes WHERE buyer = ?").get(normalizedWallet) as { count: number }).count);
    const rows = this.db.prepare(`
      SELECT quote_id, buyer, input_lamports, output_token_units, status, tx_signature,
             created_at, updated_at, confirmed_at
      FROM quotes
      WHERE buyer = ?
      ORDER BY COALESCE(confirmed_at, updated_at, created_at) DESC, quote_id DESC
      LIMIT ? OFFSET ?
    `).all(normalizedWallet, pageSize, (page - 1) * pageSize) as Array<Record<string, unknown>>;
    return {
      items: rows.map(mapWalletPurchaseRecord),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** Read-only wallet-scoped totals. Only CONFIRMED rows contribute to totals. */
  getWalletPurchaseSummary(wallet: string): WalletPurchaseSummary {
    const normalizedWallet = wallet.trim();
    const rows = this.db.prepare(`
      SELECT input_lamports, output_token_units, status
      FROM quotes WHERE buyer = ?
    `).all(normalizedWallet) as Array<{ input_lamports: string; output_token_units: string; status: string }>;
    let confirmedSol = 0n;
    let confirmedGtree = 0n;
    let confirmedCount = 0;
    let pendingCount = 0;
    for (const row of rows) {
      if (row.status === "CONFIRMED") {
        confirmedSol += BigInt(row.input_lamports);
        confirmedGtree += BigInt(row.output_token_units);
        confirmedCount += 1;
      } else if (["CREATED", "BUILT", "CONSUMED", "SUBMITTED"].includes(row.status)) {
        pendingCount += 1;
      }
    }
    const latest = this.getWalletPurchaseHistory(normalizedWallet, { page: 1, pageSize: 5 }).items
      .filter((item) => item.status === "CONFIRMED");
    return {
      wallet: normalizedWallet,
      confirmedGtreeTokenUnits: confirmedGtree.toString(),
      confirmedSolLamports: confirmedSol.toString(),
      confirmedPurchaseCount: confirmedCount,
      pendingPurchaseCount: pendingCount,
      latestConfirmedPurchases: latest,
    };
  }

  private startOfUtcDay(nowMs: number): number {
    const date = new Date(nowMs);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
}

/**
 * Creates and migrates the canonical Foundation sale ledger when it has not
 * been initialized yet. Production maps the application data path to the
 * persistent Foundation database; this helper never selects another path.
 */
export function ensureFoundationSaleLedger(): void {
  new SQLiteFoundationSaleControlStore();
}

function finiteDecimal(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? String(value) : null;
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  return Number.isInteger(value) ? Math.min(max, Math.max(min, value as number)) : fallback;
}

function mapWalletPurchaseRecord(row: Record<string, unknown>): WalletPurchaseRecord {
  return {
    purchaseId: String(row.quote_id),
    wallet: String(row.buyer),
    solLamports: String(row.input_lamports),
    gtreeTokenUnits: String(row.output_token_units),
    status: String(row.status) === "CONSUMED" ? "BUILT" : String(row.status) as DbQuote["status"],
    transactionSignature: row.tx_signature ? String(row.tx_signature) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    confirmedAt: row.confirmed_at == null ? null : Number(row.confirmed_at),
  };
}
