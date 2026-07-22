import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

async function main() {
  console.log("=== SEARCHING FOR SOLANA WALLETS & KEYPAIRS ===");

  const homedir = os.homedir();
  const searchPaths = [
    path.join(homedir, ".config", "solana", "id.json"),
    path.join(homedir, ".config", "solana"),
    path.resolve(".."), // parent of workspace
    path.resolve("."),  // workspace root
  ];

  for (const sPath of searchPaths) {
    try {
      if (!fs.existsSync(sPath)) continue;
      const stats = fs.statSync(sPath);
      if (stats.isFile() && sPath.endsWith(".json")) {
        console.log(`Found JSON file: ${sPath} (${stats.size} bytes)`);
        checkIfValidKeypair(sPath);
      } else if (stats.isDirectory()) {
        const files = fs.readdirSync(sPath);
        for (const file of files) {
          if (file.endsWith(".json")) {
            const fullPath = path.join(sPath, file);
            if (fs.statSync(fullPath).isFile()) {
              console.log(`Found JSON file in directory: ${fullPath}`);
              checkIfValidKeypair(fullPath);
            }
          }
        }
      }
    } catch (err) {
      console.error(`Error checking path ${sPath}:`, err);
    }
  }
}

function checkIfValidKeypair(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, "utf8").trim();
    // Keypairs are usually arrays of 64 numbers
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length === 64 && parsed.every(x => typeof x === "number")) {
      const { Keypair } = require("@solana/web3.js");
      const kp = Keypair.fromSecretKey(Uint8Array.from(parsed));
      console.log(`  -> VALID KEYPAIR: Public Key = ${kp.publicKey.toBase58()}`);
    }
  } catch {
    // Not a keypair
  }
}

main().catch(console.error);
