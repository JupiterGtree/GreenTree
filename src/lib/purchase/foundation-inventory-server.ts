import "server-only";

import { getAccount, getMint } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { SERVER_ENV } from "@/config/server-env";
import { PROJECT } from "@/lib/constants/project";
import { buildFoundationInventorySnapshot } from "@/lib/purchase/foundation-inventory";
import type { FoundationInventorySnapshot } from "@/types/market";

const INVENTORY_CACHE_TTL_MS = 20_000;

let cached: { value: FoundationInventorySnapshot; expiresAt: number } | null = null;
let inFlight: Promise<FoundationInventorySnapshot> | null = null;

function configuredPublicKey(name: string, fallback?: string): PublicKey {
  const value = process.env[name]?.trim() || fallback;
  if (!value) throw new Error(`${name} is required for Foundation inventory.`);
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${name} must be a valid Solana public key.`);
  }
}

function configuredDecimals(): number {
  const value = process.env.FOUNDATION_DIRECT_TOKEN_DECIMALS?.trim() || String(PROJECT.decimals);
  if (!/^\d+$/.test(value)) throw new Error("FOUNDATION_DIRECT_TOKEN_DECIMALS must be an integer.");
  return Number(value);
}

export async function readFoundationInventorySnapshot(): Promise<FoundationInventorySnapshot> {
  const mintAddress = configuredPublicKey("FOUNDATION_DIRECT_GTREE_MINT", PROJECT.mint);
  const saleTokenAccount = configuredPublicKey("FOUNDATION_DIRECT_SALE_TOKEN_ACCOUNT");
  const saleSigner = configuredPublicKey("FOUNDATION_DIRECT_SALE_SIGNER_PUBLIC_KEY");
  const configuredTokenDecimals = configuredDecimals();
  const connection = new Connection(SERVER_ENV.solanaRpcUrl, "confirmed");
  const [account, mint] = await Promise.all([
    getAccount(connection, saleTokenAccount, "confirmed"),
    getMint(connection, mintAddress, "confirmed"),
  ]);

  if (!account.mint.equals(mintAddress)) {
    throw new Error("Configured Foundation sale account uses the wrong mint.");
  }
  if (mint.decimals !== configuredTokenDecimals) {
    throw new Error("Configured GTREE mint decimals do not match on-chain mint decimals.");
  }
  if (account.isFrozen) throw new Error("Configured Foundation sale account is frozen.");

  const delegateActive = account.delegate?.equals(saleSigner) ?? false;
  if (!account.owner.equals(saleSigner) && !delegateActive) {
    throw new Error("Configured Foundation sale signer is not authorized for the sale account.");
  }

  return buildFoundationInventorySnapshot({
    accountBalance: account.amount,
    delegatedAllowance: account.delegatedAmount,
    delegateActive,
    tokenDecimals: mint.decimals,
    mint: mintAddress.toBase58(),
    saleTokenAccount: saleTokenAccount.toBase58(),
  });
}

export function getFoundationInventorySnapshot(options: { force?: boolean } = {}) {
  const now = Date.now();
  if (!options.force && cached && cached.expiresAt > now) return Promise.resolve(cached.value);
  if (inFlight) return inFlight;

  inFlight = readFoundationInventorySnapshot()
    .then((value) => {
      cached = { value, expiresAt: Date.now() + INVENTORY_CACHE_TTL_MS };
      return value;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function invalidateFoundationInventorySnapshot() {
  cached = null;
}
