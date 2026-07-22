import * as fs from "node:fs";
import { Keypair } from "@solana/web3.js";

async function main() {
  try {
    const authContent = fs.readFileSync("solana/foundation-sale/test-keys/authority.json", "utf8");
    const authKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(authContent)));
    console.log("test-keys/authority.json PubKey:", authKp.publicKey.toBase58());
  } catch (err: any) {
    console.log("authority.json error:", err.message);
  }

  try {
    const deployContent = fs.readFileSync("solana/foundation-sale/target/deploy/gtree_foundation_sale-keypair.json", "utf8");
    const deployKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(deployContent)));
    console.log("target/deploy/gtree_foundation_sale-keypair.json PubKey:", deployKp.publicKey.toBase58());
  } catch (err: any) {
    console.log("gtree_foundation_sale-keypair.json error:", err.message);
  }
}

main().catch(console.error);
