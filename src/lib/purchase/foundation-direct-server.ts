import "server-only";

import * as fs from "node:fs";
import * as path from "node:path";

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAccount, getMint } from "@solana/spl-token";
import { SERVER_ENV } from "@/config/server-env";
import { resolveRuntimeSetting } from "@/lib/admin/runtime-settings";
import { PROJECT } from "@/lib/constants/project";
import {
  type FoundationDirectConfig,
  type FoundationSaleControlStore,
  type MintSnapshot,
  type PurchaseChainReader,
  type ReferencePriceProvider,
  type TokenAccountSnapshot,
} from "@/lib/purchase/foundation-direct";
import { AggregatedFoundationReferencePriceProvider } from "@/lib/purchase/foundation-reference-price";

import { SQLiteFoundationSaleControlStore } from "./foundation-direct-db";

const SOL_DECIMALS = 9;
const DEFAULT_QUOTE_EXPIRY_SECONDS = 15;
const DEFAULT_PRICE_PROBES = "1000000,5000000,10000000";
let foundationSaleControlStore: SQLiteFoundationSaleControlStore | null = null;

export function createFoundationDirectConfig(): FoundationDirectConfig {
  const purchaseMode = resolveRuntimeSetting("purchaseMode") as FoundationDirectConfig["purchaseMode"];
  const isDirectMode = purchaseMode === "FOUNDATION_DIRECT";
  const emergencyPaused = resolveRuntimeSetting("emergencyPaused") as boolean;

  if (!isDirectMode) {
    return {
      purchaseMode,
      treasuryRecipient: PublicKey.default,
      gtreeMint: new PublicKey(PROJECT.mint),
      saleTokenAccount: PublicKey.default,
      saleSigner: Keypair.generate(),
      tokenDecimals: PROJECT.decimals,
      minPurchaseLamports: 0n,
      maxPurchaseLamports: 0n,
      maxOutputTokenUnitsPerTx: null,
      maxPurchaseUsdCents: null,
      maxWalletTokenUnitsPerPeriod: null,
      walletRollingPeriodSeconds: 86_400,
      maxDailyTokenUnits: null,
      minRemainingInventoryTokenUnits: 0n,
      quoteExpirySeconds: DEFAULT_QUOTE_EXPIRY_SECONDS,
      priceAdjustmentBps: 0,
      emergencyPaused: emergencyPaused,
    };
  }

  const signerPubKeyStr = process.env.FOUNDATION_DIRECT_SALE_SIGNER_PUBLIC_KEY?.trim() || "";
  const saleSigner = emergencyPaused ? Keypair.generate() : readKeypair(signerPubKeyStr);

  return {
    purchaseMode: "FOUNDATION_DIRECT",
    treasuryRecipient: readPublicKey("FOUNDATION_DIRECT_TREASURY_RECIPIENT"),
    gtreeMint: readPublicKey("FOUNDATION_DIRECT_GTREE_MINT", PROJECT.mint),
    saleTokenAccount: readPublicKey("FOUNDATION_DIRECT_SALE_TOKEN_ACCOUNT"),
    saleSigner,
    tokenDecimals: readInteger("FOUNDATION_DIRECT_TOKEN_DECIMALS", PROJECT.decimals),
    minPurchaseLamports: BigInt(resolveRuntimeSetting("minPurchaseLamports") as string),
    maxPurchaseLamports: BigInt(resolveRuntimeSetting("maxPurchaseLamports") as string),
    maxOutputTokenUnitsPerTx: optionalSettingBigint("maxOutputTokenUnitsPerTx"),
    maxPurchaseUsdCents: optionalSettingBigint("maxPurchaseUsdCents"),
    maxWalletTokenUnitsPerPeriod: optionalSettingBigint("maxWalletTokenUnitsPerPeriod"),
    walletRollingPeriodSeconds: resolveRuntimeSetting("walletRollingPeriodSeconds") as number,
    maxDailyTokenUnits: optionalSettingBigint("maxDailyTokenUnits"),
    minRemainingInventoryTokenUnits: BigInt(resolveRuntimeSetting("minRemainingInventoryTokenUnits") as string),
    quoteExpirySeconds: resolveRuntimeSetting("quoteExpirySeconds") as number,
    priceAdjustmentBps: resolveRuntimeSetting("priceAdjustmentBps") as number,
    emergencyPaused,
    controlStore: getFoundationSaleControlStore(),
    computeUnitLimit: readOptionalInteger("FOUNDATION_DIRECT_COMPUTE_UNIT_LIMIT"),
    computeUnitPriceMicroLamports: readOptionalInteger("FOUNDATION_DIRECT_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS"),
  };
}

export function createFoundationDirectPriceProvider(): ReferencePriceProvider {
  return new AggregatedFoundationReferencePriceProvider({
    probeLamports: readProbeLamports(),
    slippageBps: resolveRuntimeSetting("priceProbeSlippageBps") as number,
    maxSourceAgeMs: resolveRuntimeSetting("referenceMaxSourceAgeMs") as number,
    maxDivergenceBps: resolveRuntimeSetting("referenceMaxDivergenceBps") as number,
    minSourceCount: resolveRuntimeSetting("referenceMinSourceCount") as number,
    sourceTimeoutMs: resolveRuntimeSetting("referenceSourceTimeoutMs") as number,
    sourceRetries: 1,
    controlStore: getFoundationSaleControlStore(),
    cacheTtlMs: resolveRuntimeSetting("referenceCacheTtlMs") as number,
  });
}

function optionalSettingBigint(
  key: "maxOutputTokenUnitsPerTx" | "maxPurchaseUsdCents" | "maxWalletTokenUnitsPerPeriod" | "maxDailyTokenUnits",
): bigint | null {
  const value = resolveRuntimeSetting(key);
  return value === null ? null : BigInt(value as string);
}

export class SolanaFoundationPurchaseReader implements PurchaseChainReader {
  constructor(private readonly connection: Connection) {}

  async getLatestBlockhash() {
    return this.connection.getLatestBlockhash("confirmed");
  }

  async getTokenAccount(address: PublicKey): Promise<TokenAccountSnapshot> {
    const account = await getAccount(this.connection, address, "confirmed");
    return {
      address,
      mint: account.mint,
      owner: account.owner,
      amount: account.amount,
      delegate: account.delegate,
      delegatedAmount: account.delegatedAmount,
      isFrozen: account.isFrozen,
    };
  }

  async getMint(address: PublicKey): Promise<MintSnapshot> {
    const mint = await getMint(this.connection, address, "confirmed");
    return { address, decimals: mint.decimals };
  }
}

export function createFoundationConnection(): Connection {
  return new Connection(SERVER_ENV.solanaRpcUrl, "confirmed");
}

function readPublicKey(name: string, fallback?: string): PublicKey {
  const value = process.env[name]?.trim() || fallback;
  if (!value) throw new Error(`${name} is required when PURCHASE_MODE=FOUNDATION_DIRECT.`);
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${name} must be a valid Solana public key.`);
  }
}

function readKeypair(expectedPublicKeyStr: string): Keypair {
  const pathVal = process.env.FOUNDATION_DIRECT_SALE_SIGNER_KEYPAIR_PATH?.trim();
  if (!pathVal) {
    throw new Error("FOUNDATION_DIRECT_SALE_SIGNER_KEYPAIR_PATH is required when PURCHASE_MODE=FOUNDATION_DIRECT and emergencyPaused=false.");
  }

  const resolvedPath = path.resolve(pathVal);
  const repoRoot = path.resolve(process.cwd());
  if (resolvedPath.startsWith(repoRoot)) {
    throw new Error("FOUNDATION_DIRECT_SALE_SIGNER_KEYPAIR_PATH must point outside the repository.");
  }

  let content: string;
  try {
    content = fs.readFileSync(resolvedPath, "utf8").trim();
  } catch {
    throw new Error("Unable to read keypair file at FOUNDATION_DIRECT_SALE_SIGNER_KEYPAIR_PATH.");
  }

  let secret: unknown;
  try {
    secret = JSON.parse(content);
  } catch {
    throw new Error("Sale signer keypair file is not valid JSON.");
  }

  if (!Array.isArray(secret) || secret.length !== 64 || !secret.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
    throw new Error("Sale signer keypair must be a valid JSON array containing exactly 64 integers.");
  }

  const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
  if (keypair.publicKey.toBase58() !== expectedPublicKeyStr) {
    throw new Error("Sale signer public key does not match FOUNDATION_DIRECT_SALE_SIGNER_PUBLIC_KEY.");
  }

  return keypair;
}

function readLamports(name: string, fallback?: bigint): bigint {
  const value = process.env[name]?.trim();
  if (!value) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${name} is required when PURCHASE_MODE=FOUNDATION_DIRECT.`);
  }
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer string.`);
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new Error(`${name} must be greater than zero.`);
  return parsed;
}

function readInteger(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer.`);
  return Number(value);
}

function readOptionalInteger(name: string): number | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer.`);
  return Number(value);
}

function readSignedInteger(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  if (!/^-?\d+$/.test(value)) throw new Error(`${name} must be an integer.`);
  return Number(value);
}

function readOptionalBigint(name: string): bigint | null {
  const value = process.env[name]?.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer string.`);
  return BigInt(value);
}

function readProbeLamports(): bigint[] {
  const raw = process.env.FOUNDATION_DIRECT_PRICE_PROBE_LAMPORTS?.trim() || DEFAULT_PRICE_PROBES;
  const probes = raw.split(",").map((value) => {
    const trimmed = value.trim();
    if (!/^[1-9]\d*$/.test(trimmed)) throw new Error("FOUNDATION_DIRECT_PRICE_PROBE_LAMPORTS must be comma-separated positive integer lamports.");
    return BigInt(trimmed);
  });
  if (probes.length === 0) throw new Error("At least one Foundation reference-price probe is required.");
  return probes;
}

function getFoundationSaleControlStore(): SQLiteFoundationSaleControlStore {
  foundationSaleControlStore ??= new SQLiteFoundationSaleControlStore();
  return foundationSaleControlStore;
}

export async function validateFoundationDirectSetup(
  config: FoundationDirectConfig,
  connection: Connection,
): Promise<void> {
  if (config.purchaseMode !== "FOUNDATION_DIRECT") {
    return;
  }

  const placeholders = [
    "11111111111111111111111111111111",
    "11111111111111111111111111111112",
    "11111111111111111111111111111113",
    "11111111111111111111111111111114",
  ];

  if (!config.saleTokenAccount || placeholders.includes(config.saleTokenAccount.toBase58())) {
    throw new Error("Foundation sale source account is missing or configured with a placeholder address.");
  }
  if (!config.treasuryRecipient || placeholders.includes(config.treasuryRecipient.toBase58())) {
    throw new Error("Foundation treasury recipient is missing or configured with a placeholder address.");
  }
  if (!config.saleSigner || placeholders.includes(config.saleSigner.publicKey.toBase58())) {
    throw new Error("Foundation sale signer is missing or configured with a placeholder address.");
  }

  let tokenAccount;
  try {
    tokenAccount = await getAccount(connection, config.saleTokenAccount, "confirmed");
  } catch (error) {
    throw new Error(`Invalid SPL source account: ${error instanceof Error ? error.message : "Account not found or uninitialized on-chain."}`);
  }

  if (!tokenAccount.mint.equals(config.gtreeMint)) {
    throw new Error(`Foundation SPL source account mint (${tokenAccount.mint.toBase58()}) does not match configured GTREE mint (${config.gtreeMint.toBase58()}).`);
  }

  const signer = config.saleSigner.publicKey;
  const isOwner = tokenAccount.owner.equals(signer);
  const isDelegate = tokenAccount.delegate?.equals(signer) ?? false;

  if (!isOwner && !isDelegate) {
    throw new Error("Foundation sale signer is neither the owner nor the authorized delegate of the SPL source account.");
  }

  if (isDelegate && tokenAccount.delegatedAmount === 0n) {
    throw new Error("Foundation sale signer is an authorized delegate, but delegated allowance is zero.");
  }
}
