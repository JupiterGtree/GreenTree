import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount, getMint } from "@solana/spl-token";

function tryReadPublicKey(name: string): PublicKey | null {
  const value = process.env[name]?.trim();
  if (!value) return null;
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

function readBigint(name: string, fallback: bigint): bigint {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  return BigInt(value);
}

function readInteger(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  return Number(value);
}

function atomicToDecimal(amount: string, decimals: number): string {
  const bigAmount = BigInt(amount);
  const factor = 10n ** BigInt(decimals);
  const whole = bigAmount / factor;
  const fraction = bigAmount % factor;
  const fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fractionStr ? `${whole}.${fractionStr}` : whole.toString();
}

async function main() {
  console.log("=== OPERATIONAL AUDIT: FOUNDATION DIRECT-SALE INVENTORY ===");

  const saleTokenAccount = tryReadPublicKey("FOUNDATION_DIRECT_SALE_TOKEN_ACCOUNT");
  const saleSignerPubKey = tryReadPublicKey("FOUNDATION_DIRECT_SALE_SIGNER_PUBLIC_KEY");
  const treasuryRecipient = tryReadPublicKey("FOUNDATION_DIRECT_TREASURY_RECIPIENT");
  const gtreeMint = tryReadPublicKey("FOUNDATION_DIRECT_GTREE_MINT") || new PublicKey("AYJ2xXLxNrcJfx7ycgZA6FQnpTSoipdRcCvJPLMadpuJ");
  const tokenDecimals = readInteger("FOUNDATION_DIRECT_TOKEN_DECIMALS", 9);
  const minRemainingInventoryTokenUnits = readBigint("FOUNDATION_DIRECT_MIN_REMAINING_INVENTORY_BASE_UNITS", 0n);

  if (!saleTokenAccount || !saleSignerPubKey) {
    console.log("\n[STATUS] Verification Pending: Public addresses not yet supplied in `.env.local`.");
    console.log("\nTo run this operational verification, please configure the following public keys in `.env.local`:");
    console.log("  FOUNDATION_DIRECT_SALE_TOKEN_ACCOUNT=<Public key of Foundation GTREE source account>");
    console.log("  FOUNDATION_DIRECT_SALE_SIGNER_PUBLIC_KEY=<Public key of the server's partial signer>");
    console.log("  FOUNDATION_DIRECT_TREASURY_RECIPIENT=<Public key of treasury destination (optional for inventory)>");
    console.log("\nNo secret keys, seed phrases, or private keys are required or printed during this audit.");
    return;
  }

  console.log("\n--- CONFIGURED PUBLIC KEYS ---");
  console.log("GTREE Mint Address:", gtreeMint.toBase58());
  console.log("Foundation Sale Signer Public Key:", saleSignerPubKey.toBase58());
  console.log("Foundation Source Token Account:", saleTokenAccount.toBase58());
  if (treasuryRecipient) {
    console.log("Treasury Recipient Public Address:", treasuryRecipient.toBase58());
  }

  const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  console.log("\n--- ON-CHAIN OPERATIONAL VERIFICATION ---");
  console.log("Solana RPC Connection:", rpcUrl);
  const connection = new Connection(rpcUrl, "confirmed");

  try {
    const mintInfo = await getMint(connection, gtreeMint);
    console.log("Verified Mint Decimals:", mintInfo.decimals);

    const tokenAccount = await getAccount(connection, saleTokenAccount);
    const grossInventoryRaw = tokenAccount.amount;
    const grossInventory = atomicToDecimal(grossInventoryRaw.toString(), tokenDecimals);

    const isOwner = tokenAccount.owner.equals(saleSignerPubKey);
    const isDelegate = tokenAccount.delegate?.equals(saleSignerPubKey) ?? false;

    let signerAllowanceRaw = grossInventoryRaw;
    if (isDelegate) {
      signerAllowanceRaw = tokenAccount.delegatedAmount;
    } else if (!isOwner) {
      signerAllowanceRaw = 0n;
    }

    const unrestrictedInventoryRaw = grossInventoryRaw > minRemainingInventoryTokenUnits
      ? grossInventoryRaw - minRemainingInventoryTokenUnits
      : 0n;

    let globalAvailableRaw = unrestrictedInventoryRaw;
    globalAvailableRaw = globalAvailableRaw < signerAllowanceRaw ? globalAvailableRaw : signerAllowanceRaw;

    const delegateAllowance = atomicToDecimal(tokenAccount.delegatedAmount.toString(), tokenDecimals);
    const protectedInventory = atomicToDecimal(minRemainingInventoryTokenUnits.toString(), tokenDecimals);
    const actualAvailable = atomicToDecimal(globalAvailableRaw.toString(), tokenDecimals);

    console.log("\n--- OPERATIONAL INVENTORY REPORT ---");
    console.log("- Foundation sale source account:", saleTokenAccount.toBase58());
    console.log("- Source owner:", tokenAccount.owner.toBase58());
    console.log("- Delegate:", tokenAccount.delegate ? tokenAccount.delegate.toBase58() : "None");
    console.log("- Delegated allowance:", delegateAllowance, "GTREE");
    console.log("- Gross GTREE balance:", grossInventory, "GTREE");
    console.log("- Protected inventory (Min Reserve):", protectedInventory, "GTREE");
    console.log("- Actual available inventory:", actualAvailable, "GTREE");

    if (!isOwner && !isDelegate) {
      console.log("\n[CRITICAL WARNING] Configured signer public key is NEITHER the owner nor the SPL delegate of the source account!");
    } else if (isDelegate && tokenAccount.delegatedAmount === 0n) {
      console.log("\n[WARNING] Signer is authorized as SPL delegate, but delegated allowance is zero.");
    } else {
      console.log("\n[SUCCESS] On-chain signer authorization and inventory limits verified.");
    }

  } catch (err) {
    console.error("\n[ERROR] Failed to query on-chain account facts. Verify RPC URL and token account address:", err instanceof Error ? err.message : err);
  }
}

main().catch(console.error);
