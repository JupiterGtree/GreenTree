import test from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, verify as verifySignature } from "node:crypto";
import { start, type BanksClient, type ProgramTestContext } from "solana-bankrun";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  type AccountInfo,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createApproveCheckedInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeAccountInstruction,
  createInitializeMintInstruction,
  createMintToCheckedInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  unpackAccount,
  unpackMint,
} from "@solana/spl-token";
import {
  createFoundationDirectQuote,
  createFoundationDirectPurchase,
  type FoundationDirectConfig,
  type FoundationSaleControlStore,
  type MintSnapshot,
  type PurchaseChainReader,
  type ReferencePrice,
  type ReferencePriceProvider,
  type TokenAccountSnapshot,
} from "../src/lib/purchase/foundation-direct";

const DECIMALS = 9;
const ONE_SOL = BigInt(LAMPORTS_PER_SOL);
const GTREE_PER_SOL_BASE_UNITS_PER_LAMPORT = 1_000n;
const PURCHASE_LAMPORTS = ONE_SOL;
const EXPECTED_GTREE_BASE_UNITS = PURCHASE_LAMPORTS * GTREE_PER_SOL_BASE_UNITS_PER_LAMPORT;

class BankrunPurchaseReader implements PurchaseChainReader {
  constructor(private readonly client: BanksClient) {}

  async getLatestBlockhash() {
    const latest = await this.client.getLatestBlockhash();
    assert(latest, "bankrun should return a blockhash");
    const [blockhash, lastValidBlockHeight] = latest;
    return { blockhash, lastValidBlockHeight };
  }

  async getTokenAccount(address: PublicKey): Promise<TokenAccountSnapshot> {
    const info = await this.client.getAccount(address);
    const account = unpackAccount(address, toWeb3AccountInfo(info), TOKEN_PROGRAM_ID);
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
    const info = await this.client.getAccount(address);
    const mint = unpackMint(address, toWeb3AccountInfo(info), TOKEN_PROGRAM_ID);
    return { address, decimals: mint.decimals };
  }
}

class MockReferencePriceProvider implements ReferencePriceProvider {
  constructor(private readonly numerator: bigint, private readonly denominator: bigint) {}

  async getReferencePrice(): Promise<ReferencePrice> {
    return {
      source: "mock local reference price",
      fetchedAt: new Date(),
      priceNumerator: this.numerator,
      priceDenominator: this.denominator,
      solPriceUsdCents: 20_000n,
      gtreePriceUsdMicros: 20n,
    };
  }
}

test("foundation direct purchase transfers exact SOL and GTREE atomically, creating ATA when absent", async () => {
  const state = await setupSale();
  const built = await buildPurchase(state);
  assert.equal(await tokenAccountExists(state, state.buyerAta), false);

  await signAndProcess(state, built.transaction, state.buyer);

  assert.equal((await state.client.getBalance(state.treasury.publicKey)) - state.initialTreasuryLamports, PURCHASE_LAMPORTS);
  assert.equal(await getTokenBalance(state.client, state.buyerAta), EXPECTED_GTREE_BASE_UNITS);
  assert.equal(await getTokenBalance(state.client, state.saleToken.publicKey), state.initialInventory - EXPECTED_GTREE_BASE_UNITS);
  assert.equal(built.transactionSizeBytes, built.transaction.serialize().length);
  assert.equal(built.expectedMainnetFeeLamports, "10000");
});

test("foundation direct purchase works when buyer ATA already exists", async () => {
  const state = await setupSale();
  await createAtaForBuyer(state);
  assert.equal(await tokenAccountExists(state, state.buyerAta), true);

  const built = await buildPurchase(state, "existing-ata-order");
  await signAndProcess(state, built.transaction, state.buyer);

  assert.equal(await getTokenBalance(state.client, state.buyerAta), EXPECTED_GTREE_BASE_UNITS);
  assert.equal((await state.client.getBalance(state.treasury.publicKey)) - state.initialTreasuryLamports, PURCHASE_LAMPORTS);
});

test("mutating a partially signed transaction invalidates the sale signer signature", async () => {
  const state = await setupSale();
  const built = await buildPurchase(state);
  const original = VersionedTransaction.deserialize(
    Buffer.from(built.serializedTransaction, "base64"),
  );

  const saleSignerIndex = original.message.staticAccountKeys.findIndex((key) =>
    key.equals(state.saleSigner.publicKey),
  );

  assert(
    saleSignerIndex >= 0 &&
      saleSignerIndex < original.message.header.numRequiredSignatures,
    "sale signer must be a required signer",
  );

  const originalSaleSignature = original.signatures[saleSignerIndex];

  assert.equal(
    verifyEd25519Signature(
      state.saleSigner.publicKey,
      original.message.serialize(),
      originalSaleSignature,
    ),
    true,
    "the original server signature must be valid",
  );

  const tampered = VersionedTransaction.deserialize(
    Buffer.from(built.serializedTransaction, "base64"),
  );
  const lastInstruction =
    tampered.message.compiledInstructions[
      tampered.message.compiledInstructions.length - 1
    ];

  lastInstruction.data[0] ^= 1;
  tampered.sign([state.buyer]);

  assert.equal(
    verifyEd25519Signature(
      state.saleSigner.publicKey,
      tampered.message.serialize(),
      tampered.signatures[saleSignerIndex],
    ),
    false,
    "changing the signed message must invalidate the existing sale signer signature",
  );
});

test("client-supplied wrong treasury, mint, or sale account is rejected before signing", async () => {
  const state = await setupSale();
  await assert.rejects(
    () => buildPurchase(state, "wrong-treasury", { clientTreasuryRecipient: PublicKey.unique() }),
    /treasury/i,
  );
  await assert.rejects(
    () => buildPurchase(state, "wrong-mint", { clientGtreeMint: PublicKey.unique() }),
    /mint/i,
  );
  await assert.rejects(
    () => buildPurchase(state, "wrong-sale", { clientSaleTokenAccount: PublicKey.unique() }),
    /sale account/i,
  );
});

test("configured wrong mint or sale account is rejected by on-chain account validation", async () => {
  const state = await setupSale();
  const wrongMint = Keypair.generate();
  await createMint(state, wrongMint, state.mintAuthority.publicKey);
  await assert.rejects(
    () => buildPurchase(state, "configured-wrong-mint", {}, { gtreeMint: wrongMint.publicKey }),
    /decimals|inventory|mint/i,
  );
  await assert.rejects(
    () => buildPurchase(state, "missing-sale-account", {}, { saleTokenAccount: PublicKey.unique() }),
    /Could not find|TokenAccountNotFound|account/i,
  );
});

test("expired or unknown blockhash cannot execute", async () => {
  const state = await setupSale();
  const built = await buildPurchase(state);
  const unknownBlockhashTransaction = VersionedTransaction.deserialize(
    Buffer.from(built.serializedTransaction, "base64"),
  );

  unknownBlockhashTransaction.message.recentBlockhash =
    PublicKey.unique().toBase58();
  unknownBlockhashTransaction.sign([state.saleSigner, state.buyer]);

  const result = await state.client.tryProcessTransaction(
    unknownBlockhashTransaction,
  );

  assert(result.result, "transaction with an unknown blockhash must fail");
  assert.match(result.result, /blockhash|not found|expired/i);
});

test("insufficient sale inventory fails atomically after SOL transfer instruction", async () => {
  const state = await setupSale();
  await createAtaForBuyer(state);
  const built = await buildPurchase(state);
  const treasuryBefore = await state.client.getBalance(state.treasury.publicKey);
  const buyerTokenBefore = await getTokenBalance(state.client, state.buyerAta);

  await drainSaleInventory(state);
  await signAndTry(state, built.transaction, state.buyer);

  assert.equal(await state.client.getBalance(state.treasury.publicKey), treasuryBefore);
  assert.equal(await getTokenBalance(state.client, state.buyerAta), buyerTokenBefore);
});

test("insufficient buyer SOL fails atomically before GTREE distribution", async () => {
  const state = await setupSale({ buyerLamports: 100_000_000n });
  await createAtaForBuyer(state);
  const built = await buildPurchase(state);
  const treasuryBefore = await state.client.getBalance(state.treasury.publicKey);
  const buyerTokenBefore = await getTokenBalance(state.client, state.buyerAta);

  await signAndTry(state, built.transaction, state.buyer);

  assert.equal(await state.client.getBalance(state.treasury.publicKey), treasuryBefore);
  assert.equal(await getTokenBalance(state.client, state.buyerAta), buyerTokenBefore);
});

test("duplicate transaction cannot execute twice", async () => {
  const state = await setupSale();
  const built = await buildPurchase(state);
  await signAndProcess(state, built.transaction, state.buyer);

  const result = await state.client.tryProcessTransaction(built.transaction);
  assert(result.result, "duplicate transaction must fail");
  assert.match(result.result, /already|processed|Blockhash|signature/i);
});

test("sale signer may be a limited SPL Token delegate", async () => {
  const state = await setupSale({ saleOwnerIsSigner: false, delegateAllowance: EXPECTED_GTREE_BASE_UNITS });
  const built = await buildPurchase(state);
  await signAndProcess(state, built.transaction, state.buyer);

  assert.equal(await getTokenBalance(state.client, state.buyerAta), EXPECTED_GTREE_BASE_UNITS);
});

test("insufficient delegate allowance is rejected before signing", async () => {
  const state = await setupSale({ saleOwnerIsSigner: false, delegateAllowance: EXPECTED_GTREE_BASE_UNITS - 1n });
  await assert.rejects(() => buildPurchase(state), /delegate allowance/i);
});

test("MARKET mode disables Foundation direct-sale creation", async () => {
  const state = await setupSale();
  await assert.rejects(() => buildPurchase(state, "market-mode", {}, { purchaseMode: "MARKET" }), /MARKET/i);
});

test("PAUSED mode disables all purchase creation", async () => {
  const state = await setupSale();
  await assert.rejects(() => buildPurchase(state, "paused-mode", {}, { purchaseMode: "PAUSED" }), /paused/i);
});

test("server response metadata does not expose the sale private key", async () => {
  const state = await setupSale();
  const built = await buildPurchase(state);
  const payload = JSON.stringify({
    transaction: built.serializedTransaction,
    orderId: built.orderId,
    saleSigner: built.saleSigner,
    treasuryRecipient: built.treasuryRecipient,
    saleTokenAccount: built.saleTokenAccount,
  });

  assert(!payload.includes(JSON.stringify(Array.from(state.saleSigner.secretKey))));
  assert(!payload.includes(Buffer.from(state.saleSigner.secretKey).toString("hex")));
  assert.equal(built.saleSigner, state.saleSigner.publicKey.toBase58());
});

test("building an unsigned Foundation transaction does not consume wallet or daily sale limits", async () => {
  const state = await setupSale();
  let issued = 0;
  const controlStore: FoundationSaleControlStore = {
    async getWalletTokenUnitsIssued() { return 0n; },
    async getDailyTokenUnitsIssued() { return 0n; },
    async recordIssuedTransaction() { issued += 1; },
    async getQuoteState() { return null; },
    async setQuoteState() {},
    async getPriceObservations() { return []; },
    async recordPriceObservation() {},
    async getCooldownUntil() { return 0; },
    async setCooldownUntil() {},
  };

  await buildPurchase(state, "unsigned-limit-check", {}, { controlStore });
  assert.equal(issued, 0, "only an on-chain confirmed settlement may consume a sale limit");
});

interface SetupOptions {
  buyerLamports?: bigint;
  saleOwnerIsSigner?: boolean;
  delegateAllowance?: bigint;
}

async function setupSale(options: SetupOptions = {}) {
  const context = await start([], []);
  const client = context.banksClient;
  const mint = Keypair.generate();
  const mintAuthority = Keypair.generate();
  const saleSigner = Keypair.generate();
  const saleOwner = options.saleOwnerIsSigner === false ? Keypair.generate() : saleSigner;
  const saleToken = Keypair.generate();
  const buyer = Keypair.generate();
  const treasury = Keypair.generate();
  const initialInventory = 10_000n * 10n ** BigInt(DECIMALS);

  await fundSystemAccount(context, buyer.publicKey, options.buyerLamports ?? 5n * ONE_SOL);
  await fundSystemAccount(context, treasury.publicKey, 1n * ONE_SOL);
  await fundSystemAccount(context, saleSigner.publicKey, 1n * ONE_SOL);
  if (!saleOwner.publicKey.equals(saleSigner.publicKey)) {
    await fundSystemAccount(context, saleOwner.publicKey, 1n * ONE_SOL);
  }

  await createMint({ context, client }, mint, mintAuthority.publicKey);
  await createTokenAccount({ context, client }, saleToken, mint.publicKey, saleOwner.publicKey);
  await sendLegacy(
    context,
    [
      createMintToCheckedInstruction(mint.publicKey, saleToken.publicKey, mintAuthority.publicKey, initialInventory, DECIMALS),
      ...(options.delegateAllowance !== undefined
        ? [createApproveCheckedInstruction(saleToken.publicKey, mint.publicKey, saleSigner.publicKey, saleOwner.publicKey, options.delegateAllowance, DECIMALS)]
        : []),
    ],
    [
      mintAuthority,
      ...(options.delegateAllowance !== undefined ? [saleOwner] : []),
    ],
  );

  const buyerAta = getAssociatedTokenAddressSync(mint.publicKey, buyer.publicKey);
  const config: FoundationDirectConfig = {
    purchaseMode: "FOUNDATION_DIRECT",
    treasuryRecipient: treasury.publicKey,
    gtreeMint: mint.publicKey,
    saleTokenAccount: saleToken.publicKey,
    saleSigner,
    tokenDecimals: DECIMALS,
    minPurchaseLamports: 1n,
    maxPurchaseLamports: 100n * ONE_SOL,
    maxOutputTokenUnitsPerTx: null,
    maxPurchaseUsdCents: null,
    maxWalletTokenUnitsPerPeriod: null,
    walletRollingPeriodSeconds: 86_400,
    maxDailyTokenUnits: null,
    minRemainingInventoryTokenUnits: 0n,
    quoteExpirySeconds: 15,
    priceAdjustmentBps: 0,
    emergencyPaused: false,
  };

  return {
    context,
    client,
    mint,
    mintAuthority,
    saleSigner,
    saleOwner,
    saleToken,
    buyer,
    buyerAta,
    treasury,
    config,
    initialInventory,
    initialTreasuryLamports: await client.getBalance(treasury.publicKey),
  };
}

async function buildPurchase(
  state: Awaited<ReturnType<typeof setupSale>>,
  orderId = "test-order-0001",
  requestOverrides: Partial<Parameters<typeof createFoundationDirectPurchase>[1]> = {},
  configOverrides: Partial<FoundationDirectConfig> = {},
) {
  return createFoundationDirectPurchase(
    { ...state.config, ...configOverrides },
    {
      buyer: state.buyer.publicKey,
      inputLamports: PURCHASE_LAMPORTS,
      orderId,
      ...requestOverrides,
    },
    new MockReferencePriceProvider(GTREE_PER_SOL_BASE_UNITS_PER_LAMPORT, 1n),
    new BankrunPurchaseReader(state.client),
  );
}

async function fundSystemAccount(context: ProgramTestContext, recipient: PublicKey, lamports: bigint) {
  await sendLegacy(context, [
    SystemProgram.transfer({
      fromPubkey: context.payer.publicKey,
      toPubkey: recipient,
      lamports,
    }),
  ]);
}

async function createMint(state: { context: ProgramTestContext; client: BanksClient }, mint: Keypair, authority: PublicKey) {
  const rent = await state.client.getRent();
  await sendLegacy(
    state.context,
    [
      SystemProgram.createAccount({
        fromPubkey: state.context.payer.publicKey,
        newAccountPubkey: mint.publicKey,
        lamports: Number(rent.minimumBalance(BigInt(MINT_SIZE))),
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(mint.publicKey, DECIMALS, authority, null),
    ],
    [mint],
  );
}

async function createTokenAccount(
  state: { context: ProgramTestContext; client: BanksClient },
  tokenAccount: Keypair,
  mint: PublicKey,
  owner: PublicKey,
) {
  const rent = await state.client.getRent();
  await sendLegacy(
    state.context,
    [
      SystemProgram.createAccount({
        fromPubkey: state.context.payer.publicKey,
        newAccountPubkey: tokenAccount.publicKey,
        lamports: Number(rent.minimumBalance(BigInt(ACCOUNT_SIZE))),
        space: ACCOUNT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeAccountInstruction(tokenAccount.publicKey, mint, owner),
    ],
    [tokenAccount],
  );
}

async function createAtaForBuyer(state: Awaited<ReturnType<typeof setupSale>>) {
  await sendLegacy(
    state.context,
    [
      createAssociatedTokenAccountIdempotentInstruction(
        state.buyer.publicKey,
        state.buyerAta,
        state.buyer.publicKey,
        state.mint.publicKey,
      ),
    ],
    [state.buyer],
  );
}

async function drainSaleInventory(state: Awaited<ReturnType<typeof setupSale>>) {
  const drain = Keypair.generate();
  await createTokenAccount({ context: state.context, client: state.client }, drain, state.mint.publicKey, state.saleSigner.publicKey);
  await sendLegacy(
    state.context,
    [
      createTransferCheckedInstruction(
        state.saleToken.publicKey,
        state.mint.publicKey,
        drain.publicKey,
        state.saleSigner.publicKey,
        state.initialInventory,
        DECIMALS,
      ),
    ],
    [state.saleSigner],
  );
}

async function signAndProcess(state: Awaited<ReturnType<typeof setupSale>>, transaction: VersionedTransaction, buyer: Keypair) {
  transaction.sign([buyer]);
  await state.client.processTransaction(transaction);
}

async function signAndTry(state: Awaited<ReturnType<typeof setupSale>>, transaction: VersionedTransaction, buyer: Keypair) {
  transaction.sign([buyer]);
  const result = await state.client.tryProcessTransaction(transaction);
  assert(result.result, "transaction should fail");
  return result;
}

function getRequiredLegacySigners(transaction: Transaction, candidates: Keypair[]): Keypair[] {
  const uniqueCandidates = new Map<string, Keypair>();

  for (const candidate of candidates) {
    uniqueCandidates.set(candidate.publicKey.toBase58(), candidate);
  }

  const message = transaction.compileMessage();
  const requiredSignerKeys = message.accountKeys
    .slice(0, message.header.numRequiredSignatures)
    .map((publicKey) => publicKey.toBase58());

  return requiredSignerKeys.map((requiredPublicKey) => {
    const signer = uniqueCandidates.get(requiredPublicKey);

    if (!signer) {
      throw new Error(`Missing required signer: ${requiredPublicKey}`);
    }

    return signer;
  });
}

async function sendLegacy(
  context: ProgramTestContext,
  instructions: TransactionInstruction[],
  signers: Keypair[] = [],
) {
  const latest = await context.banksClient.getLatestBlockhash();
  assert(latest, "bankrun should return a blockhash");

  const transaction = new Transaction({
    feePayer: context.payer.publicKey,
    recentBlockhash: latest[0],
  });

  transaction.add(...instructions);

  const requiredSigners = getRequiredLegacySigners(transaction, [
    context.payer,
    ...signers,
  ]);

  transaction.sign(...requiredSigners);
  await context.banksClient.processTransaction(transaction);
}

async function getTokenBalance(client: BanksClient, address: PublicKey): Promise<bigint> {
  const info = await client.getAccount(address);
  const account = unpackAccount(address, toWeb3AccountInfo(info), TOKEN_PROGRAM_ID);
  return account.amount;
}

async function tokenAccountExists(state: Awaited<ReturnType<typeof setupSale>>, address: PublicKey): Promise<boolean> {
  return (await state.client.getAccount(address)) !== null;
}

function toWeb3AccountInfo(info: Awaited<ReturnType<BanksClient["getAccount"]>>): AccountInfo<Buffer> | null {
  if (!info) return null;
  return {
    data: Buffer.from(info.data),
    executable: info.executable,
    lamports: Number(info.lamports),
    owner: info.owner,
    rentEpoch: Number(info.rentEpoch),
  };
}

function verifyEd25519Signature(
  publicKey: PublicKey,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  const ed25519SpkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  const keyObject = createPublicKey({
    key: Buffer.concat([ed25519SpkiPrefix, publicKey.toBuffer()]),
    format: "der",
    type: "spki",
  });

  return verifySignature(
    null,
    Buffer.from(message),
    keyObject,
    Buffer.from(signature),
  );
}

function decimalStringToBaseUnits(value: string, decimals: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);

  assert(match, `invalid unsigned decimal string: ${value}`);

  const whole = match[1];
  const fraction = match[2] ?? "";

  assert(
    fraction.length <= decimals,
    `decimal string has more than ${decimals} fractional digits: ${value}`,
  );

  const paddedFraction = fraction.padEnd(decimals, "0");

  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(paddedFraction || "0")
  );
}

test("foundation direct quote calculates correct output GTREE and consistent USD values", async () => {
  const mint = PublicKey.unique();
  const saleTokenAccount = PublicKey.unique();
  const saleSigner = Keypair.generate();
  const buyer = PublicKey.unique();
  const config: FoundationDirectConfig = {
    purchaseMode: "FOUNDATION_DIRECT",
    treasuryRecipient: PublicKey.unique(),
    gtreeMint: mint,
    saleTokenAccount,
    saleSigner,
    tokenDecimals: 9,
    minPurchaseLamports: 1n,
    maxPurchaseLamports: 100n * ONE_SOL,
    maxOutputTokenUnitsPerTx: null,
    maxPurchaseUsdCents: null,
    maxWalletTokenUnitsPerPeriod: null,
    walletRollingPeriodSeconds: 86_400,
    maxDailyTokenUnits: null,
    minRemainingInventoryTokenUnits: 0n,
    quoteExpirySeconds: 15,
    priceAdjustmentBps: 0,
    emergencyPaused: false,
  };

  class SimpleMockChainReader implements PurchaseChainReader {
    async getLatestBlockhash() {
      return { blockhash: "mock", lastValidBlockHeight: 123n };
    }
    async getTokenAccount(address: PublicKey): Promise<TokenAccountSnapshot> {
      return {
        address,
        mint,
        owner: saleSigner.publicKey,
        // 10,000 GTREE inventory, safely above the 1,500 GTREE quote output.
        amount: 10_000n * ONE_SOL,
        delegate: null,
        delegatedAmount: 0n,
        isFrozen: false,
      };
    }
    async getMint(address: PublicKey): Promise<MintSnapshot> {
      return { address, decimals: 9 };
    }
  }

  const mockPriceProvider: ReferencePriceProvider = {
    async getReferencePrice(): Promise<ReferencePrice> {
      return {
        source: "mock reference price provider",
        fetchedAt: new Date(),
        priceNumerator: 1000n, // 1000 base units of GTREE per lamport (which means 1000 GTREE per SOL since decimals are the same)
        priceDenominator: 1n,
        solPriceUsdCents: 150_00n, // $150 per SOL
        gtreePriceUsdMicros: 150_000n, // 150_000 micro-USD per GTREE = $0.15
      };
    },
  };

  const quote = await createFoundationDirectQuote(
    config,
    {
      inputSol: "1.5",
      inputLamports: 1_500_000_000n,
      buyer,
    },
    mockPriceProvider,
    new SimpleMockChainReader(),
  );

  assert.equal(quote.mode, "FOUNDATION_DIRECT");
  assert.equal(quote.inputSol, "1.5");
  assert.equal(
    decimalStringToBaseUnits(quote.outputGtree, DECIMALS),
    1_500n * ONE_SOL,
  );
  assert.equal(
    decimalStringToBaseUnits(quote.gtreePerSol, DECIMALS),
    1_000n * ONE_SOL,
  );

  // Verify consistent USD prices
  assert.equal(quote.solPriceUsd, 150);
  assert.equal(quote.gtreePriceUsd, 0.15);

  // Verify inputUsd and outputUsd are correctly calculated and consistent
  assert.equal(quote.inputUsd, 1.5 * 150); // $225
  assert.equal(quote.outputUsd, 1500 * 0.15); // $225
});
