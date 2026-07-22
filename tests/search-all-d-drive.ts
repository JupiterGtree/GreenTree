import * as fs from "node:fs";
import * as path from "node:path";

function searchDirectory(dir: string, depth = 0) {
  if (depth > 6) return; // avoid going too deep
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file === "node_modules" || file === ".git" || file === ".next" || file === "target") continue;
      const fullPath = path.join(dir, file);
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        searchDirectory(fullPath, depth + 1);
      } else if (stats.isFile() && file.endsWith(".json")) {
        checkFile(fullPath);
      }
    }
  } catch {
    // ignore permission errors
  }
}

function checkFile(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, "utf8").trim();
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length === 64 && parsed.every(x => typeof x === "number")) {
      const { Keypair } = require("@solana/web3.js");
      const kp = Keypair.fromSecretKey(Uint8Array.from(parsed));
      console.log(`FOUND KEYPAIR: ${filePath}`);
      console.log(`  Public Key: ${kp.publicKey.toBase58()}`);
    }
  } catch {
    // not a valid keypair json
  }
}

console.log("=== SEARCHING D:\\Projects FOR ALL 64-BYTE KEYPAIR ARRAYS ===");
searchDirectory("D:\\Projects");
console.log("=== SEARCH COMPLETE ===");
