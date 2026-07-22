import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

async function main() {
  const pathsToCheck = [
    "/home/arash/.config/solana/green-tree/foundation-sale-signer.json",
    "C:\\home\\arash\\.config\\solana\\green-tree\\foundation-sale-signer.json",
    "D:\\home\\arash\\.config\\solana\\green-tree\\foundation-sale-signer.json",
    path.join(os.homedir(), ".config", "solana", "green-tree", "foundation-sale-signer.json"),
    "C:\\Users\\Arash\\.config\\solana\\green-tree\\foundation-sale-signer.json",
  ];

  console.log("=== CHECKING SIGNER PATHS ===");
  for (const p of pathsToCheck) {
    console.log(`Checking path: ${p}`);
    try {
      const exists = fs.existsSync(p);
      console.log(`  Exists: ${exists}`);
      if (exists) {
        const stats = fs.statSync(p);
        console.log(`  Size: ${stats.size} bytes`);
      }
    } catch (err: any) {
      console.log(`  Error checking: ${err.message}`);
    }
  }
}

main().catch(console.error);
