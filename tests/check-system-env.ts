console.log("=== SYSTEM ENVIRONMENT VARIABLE KEYS ===");
for (const key of Object.keys(process.env)) {
  if (key.includes("GTREE") || key.includes("FOUNDATION") || key.includes("SOLANA") || key.includes("PAYER") || key.includes("MINT") || key.includes("SIGNER") || key.includes("SECRET") || key.includes("PURCHASE")) {
    console.log(`- ${key}`);
  }
}
