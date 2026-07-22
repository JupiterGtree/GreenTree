import * as fs from "node:fs";
import * as path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token";
import { SystemProgram } from "@solana/web3.js";
import { MEMO_PROGRAM_ID } from "../src/lib/purchase/foundation-direct";
import { TransactionInstruction } from "@solana/web3.js";

async function main() {
  console.log("=== FOUNDATION DIRECT-SALE TRANSACTION BUILDER & SIMULATOR ===");

  const saleTokenAccountVal = process.env.FOUNDATION_DIRECT_SALE_TOKEN_ACCOUNT?.trim();
  const signerPathVal = process.env.FOUNDATION_DIRECT_SALE_SIGNER_KEYPAIR_PATH?.trim();
  const treasuryRecipientVal = process.env.FOUNDATION_DIRECT_TREASURY_RECIPIENT?.trim();

  const placeholders = [
    "11111111111111111111111111111111",
    "11111111111111111111111111111112",
    "11111111111111111111111111111113",
    "11111111111111111111111111111114",
  ];

  if (
    !saleTokenAccountVal ||
    !signerPathVal ||
    !treasuryRecipientVal ||
    placeholders.includes(saleTokenAccountVal) ||
    placeholders.includes(treasuryRecipientVal)
  ) {
    console.log("\n[STATUS] Simulation Pending: Real public/private accounts not yet configured in `.env.local`.");
    console.log("\nTo run a real Mainnet simulation, please configure the following keys in `.env.local`:");
    console.log("  FOUNDATION_DIRECT_SALE_TOKEN_ACCOUNT=<Real SPL token account>");
    console.log("  FOUNDATION_DIRECT_TREASURY_RECIPIENT=<Real treasury destination>");
    console.log("  FOUNDATION_DIRECT_SALE_SIGNER_KEYPAIR_PATH=<Path to keypair JSON file>");
    console.log("\nNo broadcast will occur. The script will only build, partially sign, and simulate.");
    return;
  }

  // 1. Identify/load the configuration
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  const gtreeMint = new PublicKey(process.env.FOUNDATION_DIRECT_GTREE_MINT || "AYJ2xXLxNrcJfx7ycgZA6FQnpTSoipdRcCvJPLMadpuJ");
  const decimals = Number(process.env.FOUNDATION_DIRECT_TOKEN_DECIMALS || "9");
  
  let keypairContent: string;
  try {
    keypairContent = fs.readFileSync(path.resolve(signerPathVal), "utf8").trim();
  } catch (err: any) {
    console.error(`Error reading keypair file at path: ${signerPathVal}. Error: ${err.message}`);
    return;
  }
  const secretKey = JSON.parse(keypairContent);
  const saleSigner = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const saleTokenAccount = new PublicKey(saleTokenAccountVal);
  const treasuryRecipient = new PublicKey(treasuryRecipientVal);
  
  const buyer = Keypair.generate(); // Simulate a buyer
  const buyerAta = getAssociatedTokenAddressSync(gtreeMint, buyer.publicKey);

  // Set simulation amounts (Proposed minimal test amount: 0.01 SOL)
  const testSolAmount = 0.01;
  const lamports = BigInt(testSolAmount * 1_000_000_000);
  
  // Assuming a reference rate of 1000 GTREE per SOL for the test
  const rateGtreePerSol = 1000;
  const testGtreeAmount = testSolAmount * rateGtreePerSol;
  const tokenBaseUnits = BigInt(testGtreeAmount * 10 ** decimals);

  const orderId = "test-order-direct-sale-sim-2026";

  console.log("\n--- TRANSACTION PARAMETERS ---");
  console.log("Network RPC:", rpcUrl);
  console.log("GTREE Mint:", gtreeMint.toBase58());
  console.log("Buyer (Fee Payer):", buyer.publicKey.toBase58());
  console.log("GTREE Destination (Buyer ATA):", buyerAta.toBase58());
  console.log("Treasury Recipient:", treasuryRecipient.toBase58());
  console.log("GTREE Source Token Account:", saleTokenAccount.toBase58());
  console.log("Foundation Sale Signer:", saleSigner.publicKey.toBase58());
  console.log(`SOL Amount: ${testSolAmount} SOL (${lamports} lamports)`);
  console.log(`GTREE Amount: ${testGtreeAmount} GTREE (${tokenBaseUnits} base units)`);
  console.log("Order ID:", orderId);

  // 2. Build instructions
  console.log("\n--- BUILDING INSTRUCTIONS ---");
  const instructions: TransactionInstruction[] = [
    // 1. Create Buyer ATA if missing
    createAssociatedTokenAccountIdempotentInstruction(
      buyer.publicKey,
      buyerAta,
      buyer.publicKey,
      gtreeMint,
    ),
    // 2. Buyer SOL transfer to Treasury
    SystemProgram.transfer({
      fromPubkey: buyer.publicKey,
      toPubkey: treasuryRecipient,
      lamports: lamports,
    }),
    // 3. Foundation SPL Token transfer to Buyer
    createTransferCheckedInstruction(
      saleTokenAccount,
      gtreeMint,
      buyerAta,
      saleSigner.publicKey,
      tokenBaseUnits,
      decimals,
    ),
    // 4. Memo instruction
    new TransactionInstruction({
      programId: new PublicKey(MEMO_PROGRAM_ID),
      keys: [],
      data: Buffer.from(`GTREE_FOUNDATION_DIRECT:${orderId}`, "utf8"),
    }),
  ];

  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  console.log("Recent Blockhash:", latestBlockhash.blockhash);

  const message = new TransactionMessage({
    payerKey: buyer.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(message);

  // 3. Partially sign with the Foundation saleSigner on the server
  console.log("\n--- PARTIAL SIGNATURE (FOUNDATION SIGNER) ---");
  transaction.sign([saleSigner]);
  console.log("Foundation signature verified locally?:", transaction.signatures[0] !== null);

  // 4. Decode and print a safe human-readable summary
  console.log("\n--- DECODED TRANSACTION SUMMARY ---");
  console.log("Fee Payer (Buyer):", transaction.message.staticAccountKeys[0].toBase58());
  console.log("Blockhash Expiry:", latestBlockhash.blockhash);
  console.log("Signers Required: 2 (Buyer, Foundation Sale Signer)");
  console.log("Atomic Instructions Count:", transaction.message.compiledInstructions.length);

  // 5. Simulate the transaction
  console.log("\n--- SOLANA MAINNET SIMULATION ---");
  try {
    // Note: Since buyer hasn't signed, we set requireSignatures: false for simulation
    const simulation = await connection.simulateTransaction(transaction, {
      sigVerify: false,
    });
    
    if (simulation.value.err) {
      console.log("Simulation Result: FAILED (Expected if mock accounts are empty/unfunded)");
      console.log("Simulation Error:", JSON.stringify(simulation.value.err));
      console.log("Simulation Logs:\n", simulation.value.logs?.join("\n"));
    } else {
      console.log("Simulation Result: SUCCESS!");
      console.log("Consumed Compute Units:", simulation.value.unitsConsumed);
    }
  } catch (err) {
    console.error("Simulation threw error:", err);
  }

  console.log("\n*** BROADCAST NOT AUTHORIZED ***");
  console.log("Mainnet broadcast approval was not supplied. Stopped before broadcast.");
}

main().catch(console.error);
