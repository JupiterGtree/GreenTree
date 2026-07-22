import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AnchorProvider, BN, Program, Wallet, type Idl } from "@anchor-lang/core";
import { assert } from "chai";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  freezeAccount,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  thawAccount,
} from "@solana/spl-token";
import {
  Connection,
  Ed25519Program,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  I64_MAX,
  I64_MIN,
  LOCALNET_CLUSTER_ID,
  QUOTE_DOMAIN,
  QUOTE_FORMAT_VERSION,
  cloneQuote,
  deriveQuoteReceipt,
  deriveSalePdas,
  quoteIdFromBigInt,
  serializePurchaseQuote,
  signPurchaseQuote,
  toAnchorQuote,
  type PurchaseQuote,
} from "../src/quote.js";
import {
  MockReferencePriceProvider,
  type SaleQuoteContext,
} from "../src/reference-price.js";

const workspace = resolve(import.meta.dirname, "..");
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const authorityPath = process.env.ANCHOR_WALLET ?? resolve(workspace, "test-keys/authority.json");
const idl = JSON.parse(readFileSync(resolve(workspace, "target/idl/gtree_foundation_sale.json"), "utf8")) as Idl;
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(authorityPath, "utf8")) as number[]));
const connection = new Connection(rpcUrl, "confirmed");
const provider = new AnchorProvider(connection, new Wallet(authority), { commitment: "confirmed" });
const program = new Program(idl, provider);
const programId = new PublicKey(idl.address);

type SaleConfigAccount = {
  authority: PublicKey;
  treasuryRecipient: PublicKey;
  tokenMint: PublicKey;
  saleVault: PublicKey;
  quoteAuthority: PublicKey;
  minPurchaseLamports: BN;
  maxPurchaseLamports: BN;
  maxQuoteAgeSeconds: BN;
  totalTokensSold: BN;
  totalLamportsCollected: BN;
  paused: boolean;
  configVersion: number;
};

type QuoteReceiptAccount = {
  saleConfig: PublicKey;
  quoteId: number[];
  buyer: PublicKey;
  inputLamports: BN;
  outputTokenBaseUnits: BN;
  executedAt: BN;
};

const accountClients = program.account as unknown as {
  saleConfig: { fetch(address: PublicKey): Promise<SaleConfigAccount> };
  quoteReceipt: { fetch(address: PublicKey): Promise<QuoteReceiptAccount> };
};

type SaleFixture = ReturnType<typeof createFixtureShell> & {
  mint: PublicKey;
  fundingAta: PublicKey;
  saleConfig: PublicKey;
  vaultAuthority: PublicKey;
  saleVault: PublicKey;
};

type PurchaseAccountOverrides = Partial<{
  buyer: PublicKey;
  saleConfig: PublicKey;
  treasuryRecipient: PublicKey;
  tokenMint: PublicKey;
  saleVault: PublicKey;
  vaultAuthority: PublicKey;
  buyerTokenAccount: PublicKey;
  quoteReceipt: PublicKey;
  instructionsSysvar: PublicKey;
}>;

const MIN_PURCHASE = 1_000_000n;
const MAX_PURCHASE = 1_000_000_000n;
const NORMAL_PURCHASE = 10_000_000n;
const NORMAL_OUTPUT = NORMAL_PURCHASE * 1_000n;
const FUND_AMOUNT = 1_000_000n * 1_000_000_000n;
const MAX_QUOTE_AGE = 300n;

const quoteAuthority = Keypair.generate();
const rotatedQuoteAuthority = Keypair.generate();
let activeQuoteAuthority = quoteAuthority;
const buyer = Keypair.generate();
const attacker = Keypair.generate();
const poorBuyer = Keypair.generate();
const secondBuyer = Keypair.generate();
const fakeTreasury = Keypair.generate();
const priceProvider = new MockReferencePriceProvider(1_000n, 1n, 9_900n, 10_000n);

function createFixtureShell(name: string) {
  return {
    name,
    treasury: Keypair.generate(),
  };
}

const fixtureAShell = createFixtureShell("sale-a");
const fixtureBShell = createFixtureShell("sale-b");
let saleA: SaleFixture;
let saleB: SaleFixture;
let attackerAtaA: PublicKey;
let buyerAtaA: PublicKey;
let poorBuyerAtaA: PublicKey;
let initialVaultA = 0n;
let firstQuote: PurchaseQuote;
let failedAtomicQuote: PurchaseQuote;
let firstTreasuryBefore = 0;
let firstTreasuryAfter = 0;
let firstBuyerTokensBefore = 0n;
let firstBuyerTokensAfter = 0n;
let sampleTransactionSignature = "";

function bn(value: bigint | number): BN {
  return new BN(value.toString());
}

async function airdrop(pubkey: PublicKey, lamports: number): Promise<void> {
  const signature = await connection.requestAirdrop(pubkey, lamports);
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
}

async function expectFailure(promise: Promise<unknown>, label: string): Promise<unknown> {
  try {
    await promise;
    assert.fail(`${label}: transaction unexpectedly succeeded`);
  } catch (error) {
    assert.exists(error, `${label}: expected an error`);
    return error;
  }
}

async function initializeFixture(
  shell: ReturnType<typeof createFixtureShell>,
  freezeAuthority: PublicKey | null,
): Promise<SaleFixture> {
  const mint = await createMint(connection, authority, authority.publicKey, freezeAuthority, 9);
  const fundingAta = (await getOrCreateAssociatedTokenAccount(connection, authority, mint, authority.publicKey)).address;
  const pdas = deriveSalePdas(programId, mint);
  await mintTo(connection, authority, mint, fundingAta, authority, FUND_AMOUNT);
  await program.methods
    .initializeSale({
      quoteAuthority: quoteAuthority.publicKey,
      minPurchaseLamports: bn(MIN_PURCHASE),
      maxPurchaseLamports: bn(MAX_PURCHASE),
      maxQuoteAgeSeconds: bn(MAX_QUOTE_AGE),
      paused: false,
    })
    .accountsStrict({
      authority: authority.publicKey,
      treasuryRecipient: shell.treasury.publicKey,
      tokenMint: mint,
      saleConfig: pdas.saleConfig,
      vaultAuthority: pdas.vaultAuthority,
      saleVault: pdas.saleVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();
  await program.methods
    .fundSaleVault(bn(FUND_AMOUNT))
    .accountsStrict({
      fundingAuthority: authority.publicKey,
      saleConfig: pdas.saleConfig,
      tokenMint: mint,
      sourceTokenAccount: fundingAta,
      saleVault: pdas.saleVault,
      vaultAuthority: pdas.vaultAuthority,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  return { ...shell, mint, fundingAta, ...pdas };
}

async function quoteContext(fixture: SaleFixture): Promise<SaleQuoteContext> {
  const config = await accountClients.saleConfig.fetch(fixture.saleConfig);
  return {
    programId,
    saleConfig: fixture.saleConfig,
    tokenMint: fixture.mint,
    treasuryRecipient: fixture.treasury.publicKey,
    configVersion: config.configVersion,
    maxQuoteAgeSeconds: BigInt(config.maxQuoteAgeSeconds.toString()),
  };
}

async function createQuote(
  fixture = saleA,
  quoteBuyer = buyer.publicKey,
  inputLamports = NORMAL_PURCHASE,
  overrides: Partial<PurchaseQuote> = {},
): Promise<PurchaseQuote> {
  const quote = await priceProvider.createPurchaseQuote(
    inputLamports,
    quoteBuyer,
    await quoteContext(fixture),
  );
  return cloneQuote(quote, overrides);
}

async function executeQuote(options: {
  quote: PurchaseQuote;
  fixture?: SaleFixture;
  buyerSigner?: Keypair;
  signingAuthority?: Keypair;
  signedQuote?: PurchaseQuote;
  verificationInstruction?: TransactionInstruction | null;
  accounts?: PurchaseAccountOverrides;
}): Promise<string> {
  const fixture = options.fixture ?? saleA;
  const buyerSigner = options.buyerSigner ?? buyer;
  const signedQuote = options.signedQuote ?? options.quote;
  const signingAuthority = options.signingAuthority ?? activeQuoteAuthority;
  const verificationInstruction = options.verificationInstruction === undefined
    ? signPurchaseQuote(signedQuote, signingAuthority).verificationInstruction
    : options.verificationInstruction;
  const accounts = {
    buyer: buyerSigner.publicKey,
    saleConfig: fixture.saleConfig,
    treasuryRecipient: fixture.treasury.publicKey,
    tokenMint: fixture.mint,
    saleVault: fixture.saleVault,
    vaultAuthority: fixture.vaultAuthority,
    buyerTokenAccount: getAssociatedTokenAddressSync(fixture.mint, buyerSigner.publicKey),
    quoteReceipt: deriveQuoteReceipt(programId, fixture.saleConfig, options.quote.quoteId),
    instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    ...options.accounts,
  };
  let builder = program.methods
    .purchaseWithQuote(toAnchorQuote(options.quote))
    .accountsStrict(accounts)
    .signers([buyerSigner]);
  if (verificationInstruction !== null) {
    builder = builder.preInstructions([verificationInstruction]);
  }
  return builder.rpc();
}

describe("gtree_foundation_sale signed quotes on Localnet", () => {
  before(async () => {
    await Promise.all([
      airdrop(authority.publicKey, 100 * LAMPORTS_PER_SOL),
      airdrop(fixtureAShell.treasury.publicKey, LAMPORTS_PER_SOL),
      airdrop(fixtureBShell.treasury.publicKey, LAMPORTS_PER_SOL),
      airdrop(fakeTreasury.publicKey, LAMPORTS_PER_SOL),
      airdrop(buyer.publicKey, 20 * LAMPORTS_PER_SOL),
      airdrop(secondBuyer.publicKey, 10 * LAMPORTS_PER_SOL),
      airdrop(attacker.publicKey, 10 * LAMPORTS_PER_SOL),
      airdrop(poorBuyer.publicKey, 5_000_000),
    ]);
    saleA = await initializeFixture(fixtureAShell, authority.publicKey);
    saleB = await initializeFixture(fixtureBShell, null);
    buyerAtaA = getAssociatedTokenAddressSync(saleA.mint, buyer.publicKey);
    attackerAtaA = (await getOrCreateAssociatedTokenAccount(connection, authority, saleA.mint, attacker.publicKey)).address;
    poorBuyerAtaA = (await getOrCreateAssociatedTokenAccount(connection, authority, saleA.mint, poorBuyer.publicKey)).address;
    initialVaultA = (await getAccount(connection, saleA.saleVault)).amount;
  });

  it("1. initializes two scoped sale configurations and removes fixed-price instructions", async () => {
    const configA = await accountClients.saleConfig.fetch(saleA.saleConfig);
    const configB = await accountClients.saleConfig.fetch(saleB.saleConfig);
    assert.equal(configA.tokenMint.toBase58(), saleA.mint.toBase58());
    assert.equal(configB.tokenMint.toBase58(), saleB.mint.toBase58());
    assert.equal(configA.quoteAuthority.toBase58(), quoteAuthority.publicKey.toBase58());
    const instructionNames = idl.instructions.map((instruction) => instruction.name);
    assert.notInclude(instructionNames, "purchase");
    assert.notInclude(instructionNames, "update_test_price");
  });

  it("2. scopes SaleConfig, Vault Authority and Sale Vault by mint/config", () => {
    assert.notEqual(saleA.saleConfig.toBase58(), saleB.saleConfig.toBase58());
    assert.notEqual(saleA.vaultAuthority.toBase58(), saleB.vaultAuthority.toBase58());
    assert.notEqual(saleA.saleVault.toBase58(), saleB.saleVault.toBase58());
  });

  it("3. makes each Sale Vault authority its scoped program PDA", async () => {
    const vaultA = await getAccount(connection, saleA.saleVault);
    const vaultB = await getAccount(connection, saleB.saleVault);
    assert.equal(vaultA.owner.toBase58(), saleA.vaultAuthority.toBase58());
    assert.equal(vaultB.owner.toBase58(), saleB.vaultAuthority.toBase58());
    assert.isFalse(PublicKey.isOnCurve(saleA.vaultAuthority.toBytes()));
  });

  it("4. funds both PDA-controlled Sale Vaults", async () => {
    assert.equal((await getAccount(connection, saleA.saleVault)).amount, FUND_AMOUNT);
    assert.equal((await getAccount(connection, saleB.saleVault)).amount, FUND_AMOUNT);
  });

  it("5. executes a valid signed quote", async () => {
    firstQuote = await createQuote();
    firstTreasuryBefore = await connection.getBalance(saleA.treasury.publicKey);
    firstBuyerTokensBefore = 0n;
    sampleTransactionSignature = await executeQuote({ quote: firstQuote });
    firstTreasuryAfter = await connection.getBalance(saleA.treasury.publicKey);
    firstBuyerTokensAfter = (await getAccount(connection, buyerAtaA)).amount;
    assert.isNotEmpty(sampleTransactionSignature);
  });

  it("6. sends the exact signed SOL amount to treasury", () => {
    assert.equal(BigInt(firstTreasuryAfter - firstTreasuryBefore), firstQuote.inputLamports);
  });

  it("7. sends the exact quoted GTREE amount to buyer", () => {
    assert.equal(firstBuyerTokensAfter - firstBuyerTokensBefore, firstQuote.outputTokenBaseUnits);
  });

  it("8. updates accounting for the signed purchase", async () => {
    const config = await accountClients.saleConfig.fetch(saleA.saleConfig);
    assert.equal(BigInt(config.totalTokensSold.toString()), firstQuote.outputTokenBaseUnits);
    assert.equal(BigInt(config.totalLamportsCollected.toString()), firstQuote.inputLamports);
  });

  it("9. rejects a quote signed by the wrong authority", async () => {
    const quote = await createQuote();
    await expectFailure(executeQuote({ quote, signingAuthority: attacker }), "wrong quote authority");
  });

  it("10. rejects a modified input amount", async () => {
    const signedQuote = await createQuote();
    const quote = cloneQuote(signedQuote, { inputLamports: signedQuote.inputLamports + 1n });
    await expectFailure(executeQuote({ quote, signedQuote }), "modified input");
  });

  it("11. rejects a modified output amount", async () => {
    const signedQuote = await createQuote();
    const quote = cloneQuote(signedQuote, { outputTokenBaseUnits: signedQuote.outputTokenBaseUnits + 1n });
    await expectFailure(executeQuote({ quote, signedQuote }), "modified output");
  });

  it("12. rejects a quote bound to a different buyer", async () => {
    const quote = await createQuote(saleA, attacker.publicKey);
    await expectFailure(executeQuote({ quote }), "modified buyer");
  });

  it("13. rejects a modified treasury and cannot redirect payment", async () => {
    const quote = await createQuote(saleA, buyer.publicKey, NORMAL_PURCHASE, {
      treasuryRecipient: fakeTreasury.publicKey,
    });
    await expectFailure(
      executeQuote({ quote, accounts: { treasuryRecipient: fakeTreasury.publicKey } }),
      "modified treasury",
    );
  });

  it("14. rejects a modified mint", async () => {
    const quote = await createQuote(saleA, buyer.publicKey, NORMAL_PURCHASE, { tokenMint: saleB.mint });
    await expectFailure(executeQuote({ quote }), "modified mint");
  });

  it("15. rejects a modified SaleConfig", async () => {
    const quote = await createQuote(saleA, buyer.publicKey, NORMAL_PURCHASE, { saleConfig: saleB.saleConfig });
    await expectFailure(executeQuote({ quote }), "modified sale config");
  });

  it("16. rejects a modified program ID", async () => {
    const quote = await createQuote(saleA, buyer.publicKey, NORMAL_PURCHASE, { programId: Keypair.generate().publicKey });
    await expectFailure(executeQuote({ quote }), "modified program id");
  });

  it("17. rejects the wrong domain separator", async () => {
    const wrongDomain = Uint8Array.from(QUOTE_DOMAIN);
    wrongDomain[0] ^= 0xff;
    const quote = await createQuote(saleA, buyer.publicKey, NORMAL_PURCHASE, { domain: wrongDomain });
    await expectFailure(executeQuote({ quote }), "wrong quote domain");
  });

  it("18. rejects the wrong quote format version", async () => {
    const quote = await createQuote(saleA, buyer.publicKey, NORMAL_PURCHASE, {
      quoteFormatVersion: QUOTE_FORMAT_VERSION + 1,
    });
    await expectFailure(executeQuote({ quote }), "wrong quote format version");
  });

  it("19. rejects an expired quote", async () => {
    const now = BigInt(Math.floor(Date.now() / 1_000));
    const quote = await createQuote(saleA, buyer.publicKey, NORMAL_PURCHASE, {
      issuedAt: now - 100n,
      expiry: now - 1n,
    });
    await expectFailure(executeQuote({ quote }), "expired quote");
  });

  it("20. rejects a quote issued too far in the future", async () => {
    const now = BigInt(Math.floor(Date.now() / 1_000));
    const quote = await createQuote(saleA, buyer.publicKey, NORMAL_PURCHASE, {
      issuedAt: now + 60n,
      expiry: now + 120n,
    });
    await expectFailure(executeQuote({ quote }), "future quote");
  });

  it("21. rejects replay of an already executed quote", async () => {
    await expectFailure(executeQuote({ quote: firstQuote }), "quote replay");
  });

  it("22. rejects the same quote ID even when other data is modified", async () => {
    const quote = cloneQuote(firstQuote, {
      inputLamports: firstQuote.inputLamports + 1n,
      outputTokenBaseUnits: firstQuote.outputTokenBaseUnits + 1_000n,
    });
    await expectFailure(executeQuote({ quote }), "modified replay");
  });

  it("23. rejects a missing Ed25519 verification instruction", async () => {
    const quote = await createQuote();
    await expectFailure(executeQuote({ quote, verificationInstruction: null }), "missing Ed25519 instruction");
  });

  it("24. rejects an unrelated Ed25519 instruction", async () => {
    const quote = await createQuote();
    const unrelated = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: activeQuoteAuthority.secretKey,
      message: Buffer.from("unrelated-message"),
    });
    await expectFailure(executeQuote({ quote, verificationInstruction: unrelated }), "unrelated Ed25519 instruction");
  });

  it("25. rejects a valid signature over a malformed/truncated quote payload", async () => {
    const quote = await createQuote();
    const malformedPayload = serializePurchaseQuote(quote).subarray(0, 100);
    const malformedInstruction = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: activeQuoteAuthority.secretKey,
      message: malformedPayload,
    });
    await expectFailure(executeQuote({ quote, verificationInstruction: malformedInstruction }), "malformed quote payload");
  });

  it("26. rejects a purchase below the configured minimum", async () => {
    const quote = await createQuote(saleA, buyer.publicKey, MIN_PURCHASE - 1n);
    await expectFailure(executeQuote({ quote }), "below-minimum quote");
  });

  it("27. rejects a purchase above the configured maximum", async () => {
    const quote = await createQuote(saleA, buyer.publicKey, MAX_PURCHASE + 1n);
    await expectFailure(executeQuote({ quote }), "above-maximum quote");
  });

  it("28. rejects a quote exceeding Sale Vault inventory", async () => {
    const quote = await createQuote(saleA, buyer.publicKey, NORMAL_PURCHASE, {
      outputTokenBaseUnits: FUND_AMOUNT,
      minimumOutputTokenBaseUnits: FUND_AMOUNT,
    });
    await expectFailure(executeQuote({ quote }), "insufficient sale inventory");
  });

  it("29. rejects signed purchases while paused and resumes normally", async () => {
    await program.methods.pauseSale().accountsStrict({ authority: authority.publicKey, saleConfig: saleA.saleConfig }).rpc();
    const quote = await createQuote();
    await expectFailure(executeQuote({ quote }), "paused signed purchase");
    await program.methods.resumeSale().accountsStrict({ authority: authority.publicKey, saleConfig: saleA.saleConfig }).rpc();
  });

  it("30. rejects a wrong Sale Vault", async () => {
    const quote = await createQuote();
    await expectFailure(executeQuote({ quote, accounts: { saleVault: attackerAtaA } }), "wrong sale vault");
  });

  it("31. rejects a buyer ATA owned by another wallet", async () => {
    const quote = await createQuote();
    await expectFailure(
      executeQuote({ quote, accounts: { buyerTokenAccount: attackerAtaA } }),
      "wrong buyer token account",
    );
  });

  it("32. rolls the SOL transfer back when the token transfer fails", async () => {
    failedAtomicQuote = await createQuote();
    await freezeAccount(connection, authority, buyerAtaA, saleA.mint, authority);
    const treasuryBefore = await connection.getBalance(saleA.treasury.publicKey);
    const tokensBefore = (await getAccount(connection, buyerAtaA)).amount;
    await expectFailure(executeQuote({ quote: failedAtomicQuote }), "frozen token destination");
    assert.equal(await connection.getBalance(saleA.treasury.publicKey), treasuryBefore);
    assert.equal((await getAccount(connection, buyerAtaA)).amount, tokensBefore);
    await thawAccount(connection, authority, buyerAtaA, saleA.mint, authority);
  });

  it("33. distributes no GTREE when the SOL transfer fails", async () => {
    const quote = await createQuote(saleA, poorBuyer.publicKey);
    const tokensBefore = (await getAccount(connection, poorBuyerAtaA)).amount;
    await expectFailure(
      executeQuote({ quote, buyerSigner: poorBuyer }),
      "buyer cannot fund SOL transfer",
    );
    assert.equal((await getAccount(connection, poorBuyerAtaA)).amount, tokensBefore);
  });

  it("34. does not consume QuoteReceipt when settlement fails", async () => {
    const receipt = deriveQuoteReceipt(programId, saleA.saleConfig, failedAtomicQuote.quoteId);
    assert.isNull(await connection.getAccountInfo(receipt));
  });

  it("35. creates and stores QuoteReceipt after successful settlement", async () => {
    const quote = await createQuote();
    await executeQuote({ quote });
    const receiptAddress = deriveQuoteReceipt(programId, saleA.saleConfig, quote.quoteId);
    const receipt = await accountClients.quoteReceipt.fetch(receiptAddress);
    assert.equal(receipt.saleConfig.toBase58(), saleA.saleConfig.toBase58());
    assert.equal(receipt.buyer.toBase58(), buyer.publicKey.toBase58());
    assert.equal(BigInt(receipt.inputLamports.toString()), quote.inputLamports);
    assert.equal(BigInt(receipt.outputTokenBaseUnits.toString()), quote.outputTokenBaseUnits);
  });

  it("36. executes two different valid quotes sequentially", async () => {
    const quoteOne = await createQuote();
    const quoteTwo = await createQuote();
    await executeQuote({ quote: quoteOne });
    await executeQuote({ quote: quoteTwo });
    assert.isNotNull(await connection.getAccountInfo(deriveQuoteReceipt(programId, saleA.saleConfig, quoteOne.quoteId)));
    assert.isNotNull(await connection.getAccountInfo(deriveQuoteReceipt(programId, saleA.saleConfig, quoteTwo.quoteId)));
  });

  it("37. cannot use a quote from one SaleConfig on another config", async () => {
    const quote = await createQuote(saleA, buyer.publicKey);
    await expectFailure(executeQuote({ quote, fixture: saleB }), "cross-config quote");
  });

  it("38. cannot use a quote for one mint with another mint", async () => {
    const quote = await createQuote(saleA, buyer.publicKey, NORMAL_PURCHASE, { tokenMint: saleB.mint });
    await expectFailure(executeQuote({ quote }), "cross-mint quote");
  });

  it("39. rejects quote-authority rotation by a non-authority", async () => {
    await expectFailure(
      program.methods
        .rotateQuoteAuthority(rotatedQuoteAuthority.publicKey)
        .accountsStrict({ authority: attacker.publicKey, saleConfig: saleA.saleConfig })
        .signers([attacker])
        .rpc(),
      "unauthorized quote-authority rotation",
    );
  });

  it("40. lets the authority rotate quoteAuthority and increments configVersion", async () => {
    const before = await accountClients.saleConfig.fetch(saleA.saleConfig);
    await program.methods
      .rotateQuoteAuthority(rotatedQuoteAuthority.publicKey)
      .accountsStrict({ authority: authority.publicKey, saleConfig: saleA.saleConfig })
      .rpc();
    const after = await accountClients.saleConfig.fetch(saleA.saleConfig);
    assert.equal(after.quoteAuthority.toBase58(), rotatedQuoteAuthority.publicKey.toBase58());
    assert.equal(after.configVersion, before.configVersion + 1);
    activeQuoteAuthority = rotatedQuoteAuthority;
  });

  it("41. rejects the old quote authority after rotation", async () => {
    const quote = await createQuote();
    await expectFailure(executeQuote({ quote, signingAuthority: quoteAuthority }), "old quote authority");
  });

  it("42. accepts the new quote authority after rotation", async () => {
    const quote = await createQuote();
    await executeQuote({ quote, signingAuthority: rotatedQuoteAuthority });
  });

  it("43. rejects timestamp arithmetic overflow safely", async () => {
    const quote = await createQuote(saleA, buyer.publicKey, NORMAL_PURCHASE, {
      issuedAt: I64_MIN,
      expiry: I64_MAX,
    });
    await expectFailure(executeQuote({ quote }), "timestamp arithmetic overflow");
  });

  it("44. updates accounting totals with checked exact deltas", async () => {
    const before = await accountClients.saleConfig.fetch(saleA.saleConfig);
    const quote = await createQuote();
    await executeQuote({ quote });
    const after = await accountClients.saleConfig.fetch(saleA.saleConfig);
    assert.equal(
      BigInt(after.totalTokensSold.toString()) - BigInt(before.totalTokensSold.toString()),
      quote.outputTokenBaseUnits,
    );
    assert.equal(
      BigInt(after.totalLamportsCollected.toString()) - BigInt(before.totalLamportsCollected.toString()),
      quote.inputLamports,
    );
  });

  it("45. retains authority-only limit updates and invalidates older config versions", async () => {
    const before = await accountClients.saleConfig.fetch(saleA.saleConfig);
    await program.methods
      .updateLimits(bn(MIN_PURCHASE * 2n), bn(MAX_PURCHASE))
      .accountsStrict({ authority: authority.publicKey, saleConfig: saleA.saleConfig })
      .rpc();
    const updated = await accountClients.saleConfig.fetch(saleA.saleConfig);
    assert.equal(updated.configVersion, before.configVersion + 1);
    await program.methods
      .updateLimits(bn(MIN_PURCHASE), bn(MAX_PURCHASE))
      .accountsStrict({ authority: authority.publicKey, saleConfig: saleA.saleConfig })
      .rpc();
  });

  it("46. retains authority withdrawal of unsold Localnet inventory", async () => {
    const amount = 1_000_000_000n;
    const beforeVault = (await getAccount(connection, saleA.saleVault)).amount;
    const beforeDestination = (await getAccount(connection, saleA.fundingAta)).amount;
    await program.methods
      .withdrawUnsoldTokens(bn(amount))
      .accountsStrict({
        authority: authority.publicKey,
        saleConfig: saleA.saleConfig,
        tokenMint: saleA.mint,
        saleVault: saleA.saleVault,
        vaultAuthority: saleA.vaultAuthority,
        destinationTokenAccount: saleA.fundingAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    assert.equal(beforeVault - (await getAccount(connection, saleA.saleVault)).amount, amount);
    assert.equal((await getAccount(connection, saleA.fundingAta)).amount - beforeDestination, amount);
  });

  it("47. retains rejection of arbitrary inventory withdrawal", async () => {
    await expectFailure(
      program.methods
        .withdrawUnsoldTokens(bn(1n))
        .accountsStrict({
          authority: attacker.publicKey,
          saleConfig: saleA.saleConfig,
          tokenMint: saleA.mint,
          saleVault: saleA.saleVault,
          vaultAuthority: saleA.vaultAuthority,
          destinationTokenAccount: attackerAtaA,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc(),
      "unauthorized withdrawal",
    );
  });

  it("48. executes an independent purchase on the second scoped configuration", async () => {
    const quote = await createQuote(saleB, secondBuyer.publicKey);
    const beforeA = (await getAccount(connection, saleA.saleVault)).amount;
    const beforeB = (await getAccount(connection, saleB.saleVault)).amount;
    await executeQuote({ quote, fixture: saleB, buyerSigner: secondBuyer, signingAuthority: quoteAuthority });
    assert.equal((await getAccount(connection, saleA.saleVault)).amount, beforeA);
    assert.equal(beforeB - (await getAccount(connection, saleB.saleVault)).amount, quote.outputTokenBaseUnits);
  });

  it("49. rejects a quote for the wrong cluster identifier", async () => {
    const quote = await createQuote(saleA, buyer.publicKey, NORMAL_PURCHASE, {
      clusterId: LOCALNET_CLUSTER_ID + 1,
    });
    await expectFailure(executeQuote({ quote }), "wrong cluster quote");
  });

  it("50. rejects a signed lifetime longer than maxQuoteAgeSeconds", async () => {
    const now = BigInt(Math.floor(Date.now() / 1_000));
    const quote = await createQuote(saleA, buyer.publicKey, NORMAL_PURCHASE, {
      issuedAt: now - 1n,
      expiry: now + MAX_QUOTE_AGE + 1n,
    });
    await expectFailure(executeQuote({ quote }), "quote age exceeds configured maximum");
  });

  after(() => {
    console.log(JSON.stringify({
      programId: programId.toBase58(),
      quoteAuthority: quoteAuthority.publicKey.toBase58(),
      rotatedQuoteAuthority: rotatedQuoteAuthority.publicKey.toBase58(),
      saleA: {
        mint: saleA?.mint.toBase58(),
        saleConfig: saleA?.saleConfig.toBase58(),
        vaultAuthority: saleA?.vaultAuthority.toBase58(),
        saleVault: saleA?.saleVault.toBase58(),
        treasury: saleA?.treasury.publicKey.toBase58(),
        initialVaultBaseUnits: initialVaultA.toString(),
      },
      sample: {
        transactionSignature: sampleTransactionSignature,
        quoteId: firstQuote ? Buffer.from(firstQuote.quoteId).toString("hex") : "",
        quoteMessageHex: firstQuote ? serializePurchaseQuote(firstQuote).toString("hex") : "",
        inputLamports: firstQuote?.inputLamports.toString(),
        outputTokenBaseUnits: firstQuote?.outputTokenBaseUnits.toString(),
        treasuryBefore: firstTreasuryBefore,
        treasuryAfter: firstTreasuryAfter,
        buyerTokensBefore: firstBuyerTokensBefore.toString(),
        buyerTokensAfter: firstBuyerTokensAfter.toString(),
      },
    }, null, 2));
  });
});
