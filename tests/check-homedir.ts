import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

async function main() {
  const homedir = os.homedir();
  console.log(`OS Homedir: ${homedir}`);
  
  const checkPaths = [
    path.join(homedir, ".config"),
    path.join(homedir, ".config", "solana"),
  ];

  for (const sPath of checkPaths) {
    console.log(`\nListing path: ${sPath}`);
    try {
      if (!fs.existsSync(sPath)) {
        console.log("  Does not exist.");
        continue;
      }
      const files = fs.readdirSync(sPath);
      for (const file of files) {
        console.log(`  - ${file}`);
      }
    } catch (err: any) {
      console.log(`  Error: ${err.message}`);
    }
  }
}

main().catch(console.error);
