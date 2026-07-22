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
    const query = this.db.prepare(`
      SELECT price_gtree_per_sol, timestamp FROM price_observations ORDER BY timestamp ASC
    `);
    const rows = query.all() as any[];
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

  private startOfUtcDay(nowMs: number): number {
    const date = new Date(nowMs);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
}

function finiteDecimal(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? String(value) : null;
}
