import "server-only";

import { Connection, PublicKey } from "@solana/web3.js";
import { PROJECT } from "@/lib/constants/project";
import { SERVER_ENV } from "@/config/server-env";
import {
  SQLiteFoundationSaleControlStore,
  type WalletPurchaseHistory,
  type WalletPurchaseSummary,
} from "@/lib/purchase/foundation-direct-db";
import { getTelegramDatabase } from "@/lib/telegram/bot-database";

export type WalletBalanceLookupStatus = "ok" | "no_token_account" | "invalid_wallet" | "rpc_error";

export interface WalletBalance {
  wallet: string;
  rawTokenUnits: string;
  gtreeBalance: string;
  decimals: number;
  lookupStatus: WalletBalanceLookupStatus;
}

export interface ParsedTokenConnection {
  getParsedTokenAccountsByOwner(owner: PublicKey, filter: { mint: PublicKey }): Promise<{
    value: Array<{ account: { data: { parsed?: { info?: { tokenAmount?: { amount?: string; decimals?: number } } } } } }>;
  }>;
}

export async function getOnChainGtreeBalance(wallet: string, connection?: ParsedTokenConnection): Promise<WalletBalance> {
  const normalized = wallet.trim();
  let owner: PublicKey;
  let mint: PublicKey;
  try {
    owner = new PublicKey(normalized);
    mint = new PublicKey(PROJECT.mint);
  } catch {
    return { wallet: normalized, rawTokenUnits: "0", gtreeBalance: "0", decimals: PROJECT.decimals, lookupStatus: "invalid_wallet" };
  }
  try {
    const client = connection ?? new Connection(SERVER_ENV.solanaRpcUrl, "confirmed");
    const response = await client.getParsedTokenAccountsByOwner(owner, { mint });
    if (!response.value.length) {
      return { wallet: normalized, rawTokenUnits: "0", gtreeBalance: "0", decimals: PROJECT.decimals, lookupStatus: "no_token_account" };
    }
    let raw = 0n;
    let decimals = PROJECT.decimals;
    for (const account of response.value) {
      const amount = account.account.data.parsed?.info?.tokenAmount;
      if (amount?.amount && /^\d+$/.test(amount.amount)) raw += BigInt(amount.amount);
      if (Number.isInteger(amount?.decimals)) decimals = amount!.decimals!;
    }
    return { wallet: normalized, rawTokenUnits: raw.toString(), gtreeBalance: formatUnits(raw, decimals), decimals, lookupStatus: "ok" };
  } catch {
    return { wallet: normalized, rawTokenUnits: "0", gtreeBalance: "0", decimals: PROJECT.decimals, lookupStatus: "rpc_error" };
  }
}

export function resolveVerifiedTelegramWallet(telegramUserId: string, sessionId: string): string | null {
  if (!/^\d+$/.test(telegramUserId) || !sessionId.trim()) return null;
  const row = getTelegramDatabase().prepare(`
    SELECT v.wallet_address
    FROM telegram_verified_wallets v
    JOIN telegram_sessions s ON s.telegram_user_id = v.telegram_user_id
    WHERE v.telegram_user_id = ? AND s.id = ? AND s.expires_at > ?
    ORDER BY v.verified_at DESC LIMIT 1
  `).get(telegramUserId, sessionId.trim(), Date.now()) as { wallet_address?: string } | undefined;
  return row?.wallet_address ?? null;
}

export function ensureTelegramSession(telegramUserId: string): string {
  const sessionId = `bot-${telegramUserId}`;
  const db = getTelegramDatabase();
  const now = Date.now();
  db.prepare("INSERT INTO telegram_users (telegram_user_id, created_at, updated_at) VALUES (?, ?, ?) ON CONFLICT(telegram_user_id) DO UPDATE SET updated_at=excluded.updated_at").run(telegramUserId, now, now);
  db.prepare("INSERT INTO telegram_sessions (id, telegram_user_id, expires_at, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at").run(sessionId, telegramUserId, now + 24 * 60 * 60_000, now);
  return sessionId;
}

export function getVerifiedTelegramWallet(telegramUserId: string): string | null {
  const row = getTelegramDatabase().prepare("SELECT wallet_address FROM telegram_verified_wallets WHERE telegram_user_id = ? ORDER BY verified_at DESC LIMIT 1").get(telegramUserId) as { wallet_address?: string } | undefined;
  return row?.wallet_address ?? null;
}

export function getWalletPurchaseSummary(wallet: string): WalletPurchaseSummary {
  return new SQLiteFoundationSaleControlStore().getWalletPurchaseSummary(wallet);
}

export function getWalletPurchaseHistory(wallet: string, page: number, pageSize: number): WalletPurchaseHistory {
  return new SQLiteFoundationSaleControlStore().getWalletPurchaseHistory(wallet, { page, pageSize });
}

function formatUnits(raw: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
