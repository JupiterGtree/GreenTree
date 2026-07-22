import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount, getMint, getAssociatedTokenAddressSync } from "@solana/spl-token";

async function main() {
  console.log("=== DISCOVERING REAL MAINNET ACCOUNTS FOR ALL FOUND KEYS ===");
  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
  const gtreeMint = new PublicKey("AYJ2xXLxNrcJfx7ycgZA6FQnpTSoipdRcCvJPLMadpuJ");

  const candidates = [
    new PublicKey("BwDQaHc6NTUtbaesL6SERjhLggrAkTmPFYBSrsYW3qcZ"),
    new PublicKey("vzKoqvCWCF5584t3BiEBQgzyyZGDLV7HnsE8jcHtdSW"),
    new PublicKey("7fgxFZ1h1tmg71hydvcdTAYHof6LV8U5U6eSFbq9MCSC"),
    new PublicKey("3wLUimZ83C6X1NTQaN6uoDAE8vLmk5oNu91bnruYcjxm")
  ];

  for (const owner of candidates) {
    console.log(`\nChecking Owner: ${owner.toBase58()}`);
    try {
      const balance = await connection.getBalance(owner);
      console.log(`  SOL Balance: ${balance / 1e9} SOL`);
    } catch (err: any) {
      console.log(`  Failed to fetch SOL balance: ${err.message}`);
    }

    try {
      const tokenAccounts = await connection.getTokenAccountsByOwner(owner, { mint: gtreeMint });
      console.log(`  Found ${tokenAccounts.value.length} token accounts for GTREE:`);
      for (const ta of tokenAccounts.value) {
        const accountInfo = await getAccount(connection, ta.pubkey);
        console.log(`    - Token Account: ${ta.pubkey.toBase58()}`);
        console.log(`      Balance: ${Number(accountInfo.amount) / 1e9} GTREE`);
        console.log(`      Owner: ${accountInfo.owner.toBase58()}`);
        console.log(`      Delegate: ${accountInfo.delegate?.toBase58() ?? "None"}`);
        console.log(`      Delegated Amount: ${accountInfo.delegatedAmount.toString()}`);
      }
    } catch (err: any) {
      console.log(`  Failed to search other token accounts: ${err.message}`);
    }
  }
}

main().catch(console.error);
