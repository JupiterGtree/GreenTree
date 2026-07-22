import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AnchorProvider, BN, Program, Wallet, type Idl } from "@anchor-lang/core";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
} from "@solana/web3.js";
import {
  deriveQuoteReceipt,
  deriveSalePdas,
  serializePurchaseQuote,
  signPurchaseQuote,
  toAnchorQuote,
} from "../src/quote.js";
import { MockReferencePriceProvider } from "../src/reference-price.js";

const workspace = resolve(import.meta.dirname, "..");
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const authorityPath = process.env.ANCHOR_WALLET ?? resolve(workspace, "test-keys/authority.json");
const idl = JSON.parse(readFileSync(resolve(workspace, "target/idl/gtree_foundation_sale.json"), "utf8")) as Idl;
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(authorityPath, "utf8")) as number[]));
const connection = new Connection(rpcUrl, "confirmed");
const provider = new AnchorProvider(connection, new Wallet(authority), { commitment: "confirmed" });
const program = new Program(idl, provider);

const treasury = Keypair.generate();
const buyer = Keypair.generate();
const localQuoteAuthority = Keypair.generate();
const priceProvider = new MockReferencePriceProvider(1_000n, 1n, 9_900n, 90_000n);
const purchaseLamports = 10_000_000n;
const fundAmount = 10_000n * 1_000_000_000n;

function bn(value: bigint): BN {
  return new BN(value.toString());
}

async function airdrop(pubkey: Keypair["publicKey"], sol: number): Promise<void> {
  const signature = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
}

async function main(): Promise<void> {
  const actualProgramId = program.programId;
  await Promise.all([
    airdrop(authority.publicKey, 20),
    airdrop(treasury.publicKey, 1),
    airdrop(buyer.publicKey, 2),
  ]);

  const mint = await createMint(connection, authority, authority.publicKey, null, 9);
  const { saleConfig, vaultAuthority, saleVault } = deriveSalePdas(actualProgramId, mint);
  const fundingAta = (await getOrCreateAssociatedTokenAccount(connection, authority, mint, authority.publicKey)).address;
  const buyerAta = getAssociatedTokenAddressSync(mint, buyer.publicKey);
  await mintTo(connection, authority, mint, fundingAta, authority, fundAmount);

  await program.methods
    .initializeSale({
      quoteAuthority: localQuoteAuthority.publicKey,
      minPurchaseLamports: bn(1_000_000n),
      maxPurchaseLamports: bn(1_000_000_000n),
      maxQuoteAgeSeconds: bn(300n),
      paused: false,
    })
    .accountsStrict({
      authority: authority.publicKey,
      treasuryRecipient: treasury.publicKey,
      tokenMint: mint,
      saleConfig,
      vaultAuthority,
      saleVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  await program.methods
    .fundSaleVault(bn(fundAmount))
    .accountsStrict({
      fundingAuthority: authority.publicKey,
      saleConfig,
      tokenMint: mint,
      sourceTokenAccount: fundingAta,
      saleVault,
      vaultAuthority,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  const quote = await priceProvider.createPurchaseQuote(purchaseLamports, buyer.publicKey, {
    programId: actualProgramId,
    saleConfig,
    tokenMint: mint,
    treasuryRecipient: treasury.publicKey,
    configVersion: 1,
    maxQuoteAgeSeconds: 300n,
  });
  const signedQuote = signPurchaseQuote(quote, localQuoteAuthority);
  const quoteReceipt = deriveQuoteReceipt(actualProgramId, saleConfig, quote.quoteId);

  const treasuryBefore = await connection.getBalance(treasury.publicKey);
  const buyerSolBefore = await connection.getBalance(buyer.publicKey);
  const vaultBefore = (await getAccount(connection, saleVault)).amount;
  const transactionSignature = await program.methods
    .purchaseWithQuote(toAnchorQuote(quote))
    .accountsStrict({
      buyer: buyer.publicKey,
      saleConfig,
      treasuryRecipient: treasury.publicKey,
      tokenMint: mint,
      saleVault,
      vaultAuthority,
      buyerTokenAccount: buyerAta,
      quoteReceipt,
      instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([signedQuote.verificationInstruction])
    .signers([buyer])
    .rpc();

  const treasuryAfter = await connection.getBalance(treasury.publicKey);
  const buyerSolAfter = await connection.getBalance(buyer.publicKey);
  const buyerTokensAfter = (await getAccount(connection, buyerAta)).amount;
  const vaultAfter = (await getAccount(connection, saleVault)).amount;

  await program.methods.pauseSale().accountsStrict({ authority: authority.publicKey, saleConfig }).rpc();
  await program.methods.resumeSale().accountsStrict({ authority: authority.publicKey, saleConfig }).rpc();

  console.log(JSON.stringify({
    network: rpcUrl,
    programId: actualProgramId.toBase58(),
    quoteAuthority: localQuoteAuthority.publicKey.toBase58(),
    testMint: mint.toBase58(),
    saleConfig: saleConfig.toBase58(),
    saleVault: saleVault.toBase58(),
    saleVaultAuthority: vaultAuthority.toBase58(),
    quoteReceipt: quoteReceipt.toBase58(),
    treasury: treasury.publicKey.toBase58(),
    buyer: buyer.publicKey.toBase58(),
    buyerAta: buyerAta.toBase58(),
    quote: {
      quoteId: Buffer.from(quote.quoteId).toString("hex"),
      inputLamports: quote.inputLamports.toString(),
      outputTokenBaseUnits: quote.outputTokenBaseUnits.toString(),
      minimumOutputTokenBaseUnits: quote.minimumOutputTokenBaseUnits.toString(),
      issuedAt: quote.issuedAt.toString(),
      expiry: quote.expiry.toString(),
      canonicalMessageHex: serializePurchaseQuote(quote).toString("hex"),
      ed25519SignatureHex: signedQuote.signature.toString("hex"),
    },
    transactionSignature,
    before: {
      treasuryLamports: treasuryBefore,
      buyerLamports: buyerSolBefore,
      buyerTokenBaseUnits: "0",
      vaultTokenBaseUnits: vaultBefore.toString(),
    },
    after: {
      treasuryLamports: treasuryAfter,
      buyerLamports: buyerSolAfter,
      buyerTokenBaseUnits: buyerTokensAfter.toString(),
      vaultTokenBaseUnits: vaultAfter.toString(),
    },
    deltas: {
      treasuryLamports: treasuryAfter - treasuryBefore,
      buyerLamportsIncludingRentAndFees: buyerSolAfter - buyerSolBefore,
      buyerTokenBaseUnits: buyerTokensAfter.toString(),
      vaultTokenBaseUnits: (vaultAfter - vaultBefore).toString(),
    },
    pauseResume: "completed",
  }, null, 2));
}

await main();
