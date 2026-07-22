/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { randomUUID } from "node:crypto";
import { atomicToDecimal } from "@/lib/market/amounts";
import { WRAPPED_SOL_MINT } from "@/lib/constants/env";
import type { FoundationDirectQuoteResult } from "@/types/market";

export const FOUNDATION_PURCHASE_MODES = ["FOUNDATION_DIRECT", "MARKET", "PAUSED"] as const;
export type FoundationPurchaseMode = (typeof FOUNDATION_PURCHASE_MODES)[number];

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const MAX_U64 = (1n << 64n) - 1n;
const LAMPORTS_PER_SOL = 1_000_000_000n;

export interface FoundationDirectConfig {
  purchaseMode: FoundationPurchaseMode;
  treasuryRecipient: PublicKey;
  gtreeMint: PublicKey;
  saleTokenAccount: PublicKey;
  saleSigner: Keypair;
  tokenDecimals: number;
  minPurchaseLamports: bigint;
  maxPurchaseLamports: bigint;
  maxOutputTokenUnitsPerTx: bigint | null;
  maxPurchaseUsdCents: bigint | null;
  maxWalletTokenUnitsPerPeriod: bigint | null;
  walletRollingPeriodSeconds: number;
  maxDailyTokenUnits: bigint | null;
  minRemainingInventoryTokenUnits: bigint;
  quoteExpirySeconds: number;
  priceAdjustmentBps: number;
  emergencyPaused: boolean;
  controlStore?: FoundationSaleControlStore;
  computeUnitLimit?: number;
  computeUnitPriceMicroLamports?: number;
}

export interface FoundationDirectRequest {
  buyer: PublicKey;
  inputLamports: bigint;
  minimumOutputTokenBaseUnits?: bigint;
  expectedOutputTokenBaseUnits?: bigint;
  orderId?: string;
  clientTreasuryRecipient?: PublicKey;
  clientGtreeMint?: PublicKey;
  clientSaleTokenAccount?: PublicKey;
}

export interface ReferencePrice {
  source: string;
  fetchedAt: Date;
  priceNumerator: bigint;
  priceDenominator: bigint;
  solPriceUsdCents: bigint | null;
  gtreePriceUsdMicros: bigint | null;
  diagnostics?: Record<string, unknown>;
}

export interface FoundationSaleControlStore {
  getWalletTokenUnitsIssued(wallet: PublicKey, periodSeconds: number, nowMs: number): Promise<bigint>;
  getDailyTokenUnitsIssued(nowMs: number): Promise<bigint>;
  recordIssuedTransaction(wallet: PublicKey, tokenUnits: bigint, nowMs: number): Promise<void>;
  getQuoteState(quoteId: string): Promise<"ISSUED" | "CONSUMED" | "EXPIRED" | null>;
  setQuoteState(quoteId: string, state: "ISSUED" | "CONSUMED" | "EXPIRED"): Promise<void>;
  getPriceObservations(): Promise<Array<{ priceGtreePerSol: string; timestamp: number }>>;
  recordPriceObservation(priceGtreePerSol: string, timestamp: number): Promise<void>;
  getCooldownUntil(): Promise<number>;
  setCooldownUntil(timestamp: number): Promise<void>;

  // Rich metadata & canonical lifecycle operations
  createQuote?(
    quoteId: string,
    buyer: string,
    inputLamports: bigint,
    outputTokenUnits: bigint,
    expiresAt: number,
    metadata?: {
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
    }
  ): Promise<void>;

  getQuote?(quoteId: string): Promise<any | null>;

  transitionQuoteStatus?(
    quoteId: string,
    fromStates: string[],
    toStatus: "CREATED" | "BUILT" | "SUBMITTED" | "CONFIRMED" | "EXPIRED" | "FAILED",
    extraFields?: Record<string, any>
  ): Promise<boolean>;

  updateQuoteStatus?(
    quoteId: string,
    status: "CREATED" | "BUILT" | "SUBMITTED" | "CONFIRMED" | "EXPIRED" | "FAILED",
    txSignature?: string | null
  ): Promise<void>;
}

export interface TokenAccountSnapshot {
  address: PublicKey;
  mint: PublicKey;
  owner: PublicKey;
  amount: bigint;
  delegate: PublicKey | null;
  delegatedAmount: bigint;
  isFrozen: boolean;
}

export interface MintSnapshot {
  address: PublicKey;
  decimals: number;
}

export interface PurchaseChainReader {
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: bigint | number }>;
  getTokenAccount(address: PublicKey): Promise<TokenAccountSnapshot>;
  getMint(address: PublicKey): Promise<MintSnapshot>;
}

export interface BuiltFoundationDirectPurchase {
  transaction: VersionedTransaction;
  serializedTransaction: string;
  orderId: string;
  inputLamports: string;
  outputTokenBaseUnits: string;
  buyerAta: string;
  treasuryRecipient: string;
  gtreeMint: string;
  saleTokenAccount: string;
  saleSigner: string;
  lastValidBlockHeight: string;
  transactionSizeBytes: number;
  expectedMainnetFeeLamports: string;
}

export interface FoundationDirectQuoteRequest {
  buyer?: PublicKey;
  inputSol: string;
  inputLamports: bigint;
  orderId?: string;
}

export interface ReferencePriceProvider {
  getReferencePrice(inputLamports: bigint, buyer: PublicKey): Promise<ReferencePrice>;
}

export async function getFoundationReferencePrice(
  provider: ReferencePriceProvider,
  inputLamports: bigint,
  buyer: PublicKey,
): Promise<ReferencePrice> {
  return provider.getReferencePrice(inputLamports, buyer);
}

export async function createFoundationDirectQuote(
  config: FoundationDirectConfig,
  request: FoundationDirectQuoteRequest,
  priceProvider: ReferencePriceProvider,
  chain: PurchaseChainReader,
): Promise<FoundationDirectQuoteResult> {
  assertMode(config.purchaseMode);
  if (config.purchaseMode === "PAUSED") throw new Error("GTREE purchases are currently paused.");
  if (config.emergencyPaused) throw new Error("Foundation direct sales are emergency-paused.");
  if (config.purchaseMode === "MARKET") {
    throw new Error("Foundation direct-sale quotes are disabled while PURCHASE_MODE is MARKET.");
  }
  if (request.inputLamports <= 0n) throw new Error("Enter an amount greater than zero.");
  if (request.inputLamports < config.minPurchaseLamports) throw new Error("Purchase amount is below the configured minimum.");
  if (request.inputLamports > config.maxPurchaseLamports) throw new Error("Purchase amount is above the configured maximum.");

  const quoteBuyer = request.buyer ?? PublicKey.default;
  const [mint, saleAccount, price] = await Promise.all([
    chain.getMint(config.gtreeMint),
    chain.getTokenAccount(config.saleTokenAccount),
    getFoundationReferencePrice(priceProvider, request.inputLamports, quoteBuyer),
  ]);
  if (!mint.address.equals(config.gtreeMint)) throw new Error("Configured GTREE mint could not be verified.");
  if (mint.decimals !== config.tokenDecimals) throw new Error("Configured GTREE mint decimals do not match project configuration.");
  if (!saleAccount.address.equals(config.saleTokenAccount)) throw new Error("Configured sale inventory account could not be verified.");
  if (!saleAccount.mint.equals(config.gtreeMint)) throw new Error("Configured sale inventory account uses the wrong mint.");
  if (saleAccount.isFrozen) throw new Error("Configured sale inventory account is frozen.");
  const saleSignerCanTransfer =
    saleAccount.owner.equals(config.saleSigner.publicKey) ||
    (saleAccount.delegate?.equals(config.saleSigner.publicKey) ?? false);
  if (!saleSignerCanTransfer) throw new Error("Foundation sale signer is not authorized for the configured sale inventory account.");

  const nowMs = fetchedNowMs();
  const outputTokenBaseUnits = applyPriceAdjustment(calculateFoundationOutput(request.inputLamports, price), config.priceAdjustmentBps);
  await enforceFoundationSaleControls(config, quoteBuyer, request.inputLamports, outputTokenBaseUnits, saleAccount.amount, price, nowMs);
  if (saleAccount.amount < outputTokenBaseUnits) {
    throw new Error("Foundation sale inventory is insufficient for this quote.");
  }
  if (saleAccount.delegate?.equals(config.saleSigner.publicKey) && saleAccount.delegatedAmount < outputTokenBaseUnits) {
    throw new Error("Foundation sale delegate allowance is insufficient for this quote.");
  }

  const fetchedAtMs = Date.now();
  const maximumAllowed = await calculateMaximumAllowedPurchase(config, quoteBuyer, saleAccount.amount, price, nowMs);
  const outputGtree = atomicToDecimal(outputTokenBaseUnits, config.tokenDecimals);
  const availableFoundationInventoryGtree = atomicToDecimal(saleAccount.amount, config.tokenDecimals);
  const gtreePerSolAtomic = (price.priceNumerator * 10n ** 9n) / price.priceDenominator;
  const gtreePerSol = atomicToDecimal(gtreePerSolAtomic, config.tokenDecimals);
  const referenceSolPriceUsd = price.solPriceUsdCents === null ? null : Number(price.solPriceUsdCents) / 100;
  const referenceGtreePriceUsd = price.gtreePriceUsdMicros === null ? null : Number(price.gtreePriceUsdMicros) / 1_000_000;

  return {
    mode: "FOUNDATION_DIRECT",
    inputSol: request.inputSol,
    inputAmountRaw: request.inputLamports.toString(),
    inputLamports: request.inputLamports.toString(),
    outputGtree,
    outputAmountRaw: outputTokenBaseUnits.toString(),
    outputTokenUnits: outputTokenBaseUnits.toString(),
    referenceGtreePriceUsd,
    referenceSolPriceUsd,
    gtreePriceUsd: referenceGtreePriceUsd,
    solPriceUsd: referenceSolPriceUsd,
    inputUsd: referenceSolPriceUsd !== null ? Number(request.inputSol) * referenceSolPriceUsd : null,
    outputUsd: referenceGtreePriceUsd !== null ? Number(outputGtree) * referenceGtreePriceUsd : null,
    quoteLossUsd: null,
    quoteLossPct: null,
    gtreePerSol,
    availableFoundationInventory: saleAccount.amount.toString(),
    availableFoundationInventoryGtree,
    maximumAllowedPurchaseLamports: maximumAllowed.lamports.toString(),
    maximumAllowedPurchaseSol: atomicToDecimal(maximumAllowed.lamports, 9),
    maximumAllowedPurchaseTokenUnits: maximumAllowed.tokenUnits.toString(),
    maximumAllowedPurchaseGtree: atomicToDecimal(maximumAllowed.tokenUnits, config.tokenDecimals),
    treasuryRecipient: config.treasuryRecipient.toBase58(),
    networkFeeSol: null,
    route: "Foundation inventory",
    routePlan: [],
    expiresAt: fetchedAtMs + config.quoteExpirySeconds * 1_000,
    quoteId: `foundation-${request.orderId ?? randomUUID()}-${request.inputLamports}-${outputTokenBaseUnits}`,
    source: "Green Tree Foundation reference price",
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    network: "solana-mainnet",
    inputMint: WRAPPED_SOL_MINT,
    outputMint: config.gtreeMint.toBase58(),
    poolAddress: null,
    websiteBonus: null,
  };
}

export function calculateFoundationOutput(inputLamports: bigint, price: ReferencePrice): bigint {
  if (inputLamports <= 0n) throw new Error("Enter an amount greater than zero.");
  if (price.priceNumerator <= 0n || price.priceDenominator <= 0n) {
    throw new Error("Foundation direct-sale reference price is invalid.");
  }
  const product = inputLamports * price.priceNumerator;
  if (product > MAX_U64 * price.priceDenominator) {
    throw new Error("Calculated token output exceeds the supported SPL Token amount range.");
  }
  const output = product / price.priceDenominator;
  if (output <= 0n) throw new Error("The quoted amount is too small to produce GTREE.");
  if (output > MAX_U64) throw new Error("Calculated token output exceeds the supported SPL Token amount range.");
  return output;
}

export async function createFoundationDirectPurchase(
  config: FoundationDirectConfig,
  request: FoundationDirectRequest,
  priceProvider: ReferencePriceProvider,
  chain: PurchaseChainReader,
): Promise<BuiltFoundationDirectPurchase> {
  assertMode(config.purchaseMode);
  if (config.purchaseMode === "PAUSED") throw new Error("GTREE purchases are currently paused.");
  if (config.emergencyPaused) throw new Error("Foundation direct sales are emergency-paused.");
  if (config.purchaseMode === "MARKET") {
    throw new Error("Foundation direct-sale transaction creation is disabled while PURCHASE_MODE is MARKET.");
  }

  if (!PublicKey.isOnCurve(request.buyer.toBytes())) {
    throw new Error("Connect a valid user-controlled Solana wallet first.");
  }
  if (request.inputLamports <= 0n) throw new Error("Enter an amount greater than zero.");
  if (request.inputLamports < config.minPurchaseLamports) throw new Error("Purchase amount is below the configured minimum.");
  if (request.inputLamports > config.maxPurchaseLamports) throw new Error("Purchase amount is above the configured maximum.");
  rejectClientOverride("treasury", request.clientTreasuryRecipient, config.treasuryRecipient);
  rejectClientOverride("mint", request.clientGtreeMint, config.gtreeMint);
  rejectClientOverride("sale account", request.clientSaleTokenAccount, config.saleTokenAccount);

  const [mint, saleAccount, price, latestBlockhash] = await Promise.all([
    chain.getMint(config.gtreeMint),
    chain.getTokenAccount(config.saleTokenAccount),
    priceProvider.getReferencePrice(request.inputLamports, request.buyer),
    chain.getLatestBlockhash(),
  ]);

  if (!mint.address.equals(config.gtreeMint)) throw new Error("Configured GTREE mint could not be verified.");
  if (mint.decimals !== config.tokenDecimals) throw new Error("Configured GTREE mint decimals do not match project configuration.");
  if (!saleAccount.address.equals(config.saleTokenAccount)) throw new Error("Configured sale inventory account could not be verified.");
  if (!saleAccount.mint.equals(config.gtreeMint)) throw new Error("Configured sale inventory account uses the wrong mint.");
  if (saleAccount.isFrozen) throw new Error("Configured sale inventory account is frozen.");

  const saleSignerCanTransfer =
    saleAccount.owner.equals(config.saleSigner.publicKey) ||
    (saleAccount.delegate?.equals(config.saleSigner.publicKey) ?? false);
  if (!saleSignerCanTransfer) throw new Error("Foundation sale signer is not authorized for the configured sale inventory account.");

  const calculatedOutputTokenBaseUnits = applyPriceAdjustment(calculateFoundationOutput(request.inputLamports, price), config.priceAdjustmentBps);
  const outputTokenBaseUnits = request.expectedOutputTokenBaseUnits ?? calculatedOutputTokenBaseUnits;
  if (request.expectedOutputTokenBaseUnits !== undefined && calculatedOutputTokenBaseUnits < request.expectedOutputTokenBaseUnits) {
    throw new Error("Foundation reference price moved below the reviewed quote. Refresh before continuing.");
  }
  await enforceFoundationSaleControls(config, request.buyer, request.inputLamports, outputTokenBaseUnits, saleAccount.amount, price, fetchedNowMs());
  if (request.minimumOutputTokenBaseUnits !== undefined && outputTokenBaseUnits < request.minimumOutputTokenBaseUnits) {
    throw new Error("The reference price moved below the requested minimum output.");
  }
  if (saleAccount.amount < outputTokenBaseUnits) {
    throw new Error("Foundation sale inventory is insufficient for this purchase.");
  }
  if (saleAccount.delegate?.equals(config.saleSigner.publicKey) && saleAccount.delegatedAmount < outputTokenBaseUnits) {
    throw new Error("Foundation sale delegate allowance is insufficient for this purchase.");
  }

  const buyerAta = getAssociatedTokenAddressSync(config.gtreeMint, request.buyer);
  const orderId = normalizeOrderId(request.orderId ?? randomUUID());
  const instructions = buildFoundationDirectInstructions(config, request, buyerAta, outputTokenBaseUnits, orderId);
  const message = new TransactionMessage({
    payerKey: request.buyer,
    recentBlockhash: latestBlockhash.blockhash,
    instructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  transaction.sign([config.saleSigner]);
  const serialized = Buffer.from(transaction.serialize()).toString("base64");
  await config.controlStore?.recordIssuedTransaction(request.buyer, outputTokenBaseUnits, fetchedNowMs());

  return {
    transaction,
    serializedTransaction: serialized,
    orderId,
    inputLamports: request.inputLamports.toString(),
    outputTokenBaseUnits: outputTokenBaseUnits.toString(),
    buyerAta: buyerAta.toBase58(),
    treasuryRecipient: config.treasuryRecipient.toBase58(),
    gtreeMint: config.gtreeMint.toBase58(),
    saleTokenAccount: config.saleTokenAccount.toBase58(),
    saleSigner: config.saleSigner.publicKey.toBase58(),
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight.toString(),
    transactionSizeBytes: transaction.serialize().length,
    expectedMainnetFeeLamports: "10000",
  };
}

async function enforceFoundationSaleControls(
  config: FoundationDirectConfig,
  wallet: PublicKey,
  inputLamports: bigint,
  outputTokenUnits: bigint,
  availableInventory: bigint,
  price: ReferencePrice,
  nowMs: number,
) {
  if (config.maxOutputTokenUnitsPerTx !== null && outputTokenUnits > config.maxOutputTokenUnitsPerTx) {
    throw new Error("Requested GTREE amount exceeds the per-transaction Foundation sale limit.");
  }
  if (config.maxPurchaseUsdCents !== null) {
    if (price.solPriceUsdCents === null) {
      throw new Error("Foundation USD purchase limit cannot be verified right now.");
    }
    const inputUsdCents = (inputLamports * price.solPriceUsdCents) / 1_000_000_000n;
    if (inputUsdCents > config.maxPurchaseUsdCents) {
      throw new Error("Requested SOL amount exceeds the configured USD purchase limit.");
    }
  }
  if (availableInventory - outputTokenUnits < config.minRemainingInventoryTokenUnits) {
    throw new Error("Foundation sale inventory reserve would fall below the configured minimum.");
  }
  if (config.controlStore && config.maxWalletTokenUnitsPerPeriod !== null) {
    const issued = await config.controlStore.getWalletTokenUnitsIssued(wallet, config.walletRollingPeriodSeconds, nowMs);
    if (issued + outputTokenUnits > config.maxWalletTokenUnitsPerPeriod) {
      throw new Error("Wallet rolling Foundation sale limit exceeded.");
    }
  }
  if (config.controlStore && config.maxDailyTokenUnits !== null) {
    const issuedToday = await config.controlStore.getDailyTokenUnitsIssued(nowMs);
    if (issuedToday + outputTokenUnits > config.maxDailyTokenUnits) {
      throw new Error("Daily Foundation sale limit exceeded.");
    }
  }
}

function applyPriceAdjustment(outputTokenUnits: bigint, adjustmentBps: number): bigint {
  if (!Number.isInteger(adjustmentBps) || adjustmentBps < -5_000 || adjustmentBps > 5_000) {
    throw new Error("Foundation direct-sale price adjustment is outside the supported range.");
  }
  const adjusted = (outputTokenUnits * BigInt(10_000 + adjustmentBps)) / 10_000n;
  if (adjusted <= 0n) throw new Error("The adjusted Foundation quote is too small.");
  if (adjusted > MAX_U64) throw new Error("Adjusted token output exceeds the supported SPL Token amount range.");
  return adjusted;
}

async function calculateMaximumAllowedPurchase(
  config: FoundationDirectConfig,
  wallet: PublicKey,
  availableInventory: bigint,
  price: ReferencePrice,
  nowMs: number,
): Promise<{ lamports: bigint; tokenUnits: bigint }> {
  let tokenCap = availableInventory > config.minRemainingInventoryTokenUnits
    ? availableInventory - config.minRemainingInventoryTokenUnits
    : 0n;
  if (config.maxOutputTokenUnitsPerTx !== null) tokenCap = minBigint(tokenCap, config.maxOutputTokenUnitsPerTx);
  if (config.controlStore && config.maxWalletTokenUnitsPerPeriod !== null) {
    const issued = await config.controlStore.getWalletTokenUnitsIssued(wallet, config.walletRollingPeriodSeconds, nowMs);
    tokenCap = minBigint(tokenCap, config.maxWalletTokenUnitsPerPeriod > issued ? config.maxWalletTokenUnitsPerPeriod - issued : 0n);
  }
  if (config.controlStore && config.maxDailyTokenUnits !== null) {
    const dailyIssued = await config.controlStore.getDailyTokenUnitsIssued(nowMs);
    tokenCap = minBigint(tokenCap, config.maxDailyTokenUnits > dailyIssued ? config.maxDailyTokenUnits - dailyIssued : 0n);
  }

  let lamportCap = config.maxPurchaseLamports;
  const inventoryLamportCap = invertAdjustedOutputToLamports(tokenCap, price, config.priceAdjustmentBps);
  lamportCap = minBigint(lamportCap, inventoryLamportCap);
  if (config.maxPurchaseUsdCents !== null && price.solPriceUsdCents !== null) {
    lamportCap = minBigint(lamportCap, (config.maxPurchaseUsdCents * LAMPORTS_PER_SOL) / price.solPriceUsdCents);
  }
  if (lamportCap < config.minPurchaseLamports) lamportCap = 0n;
  const outputAtLamportCap = lamportCap > 0n
    ? applyPriceAdjustment(calculateFoundationOutput(lamportCap, price), config.priceAdjustmentBps)
    : 0n;
  return { lamports: lamportCap, tokenUnits: minBigint(tokenCap, outputAtLamportCap) };
}

function invertAdjustedOutputToLamports(tokenUnits: bigint, price: ReferencePrice, adjustmentBps: number): bigint {
  const adjustment = BigInt(10_000 + adjustmentBps);
  if (tokenUnits <= 0n || adjustment <= 0n) return 0n;
  return (tokenUnits * price.priceDenominator * 10_000n) / (price.priceNumerator * adjustment);
}

function minBigint(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function fetchedNowMs(): number {
  return Date.now();
}

function buildFoundationDirectInstructions(
  config: FoundationDirectConfig,
  request: FoundationDirectRequest,
  buyerAta: PublicKey,
  outputTokenBaseUnits: bigint,
  orderId: string,
): TransactionInstruction[] {
  const instructions: TransactionInstruction[] = [];
  if (config.computeUnitLimit) {
    instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: config.computeUnitLimit }));
  }
  if (config.computeUnitPriceMicroLamports) {
    instructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: config.computeUnitPriceMicroLamports }));
  }
  instructions.push(
    createAssociatedTokenAccountIdempotentInstruction(
      request.buyer,
      buyerAta,
      request.buyer,
      config.gtreeMint,
    ),
    SystemProgram.transfer({
      fromPubkey: request.buyer,
      toPubkey: config.treasuryRecipient,
      lamports: request.inputLamports,
    }),
    createTransferCheckedInstruction(
      config.saleTokenAccount,
      config.gtreeMint,
      buyerAta,
      config.saleSigner.publicKey,
      outputTokenBaseUnits,
      config.tokenDecimals,
    ),
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [],
      data: Buffer.from(`GTREE_FOUNDATION_DIRECT:${orderId}`, "utf8"),
    }),
  );
  return instructions;
}

function rejectClientOverride(label: string, provided: PublicKey | undefined, expected: PublicKey) {
  if (provided && !provided.equals(expected)) {
    throw new Error(`Client supplied ${label} does not match the configured Foundation direct-sale ${label}.`);
  }
}

function normalizeOrderId(orderId: string): string {
  const trimmed = orderId.trim();
  if (!/^[A-Za-z0-9._:-]{8,96}$/.test(trimmed)) {
    throw new Error("Order ID must be 8-96 characters and contain only letters, numbers, dot, underscore, colon or dash.");
  }
  return trimmed;
}

function assertMode(mode: string): asserts mode is FoundationPurchaseMode {
  if (!FOUNDATION_PURCHASE_MODES.includes(mode as FoundationPurchaseMode)) {
    throw new Error("Invalid purchase mode.");
  }
}

export { MEMO_PROGRAM_ID, TOKEN_PROGRAM_ID };
