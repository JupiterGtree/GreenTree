import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { Keypair, PublicKey } from "@solana/web3.js";
import type { FoundationDirectConfig } from "@/lib/purchase/foundation-direct";
import type { FoundationDirectQuoteResult } from "@/types/market";

const QUOTE_TOKEN_VERSION = 1;

interface FoundationQuoteTokenPayload {
  version: 1;
  mode: "FOUNDATION_DIRECT";
  quoteId: string;
  buyer: string;
  inputLamports: string;
  outputTokenUnits: string;
  treasuryRecipient: string;
  gtreeMint: string;
  saleTokenAccount: string;
  expiresAt: number;
}

export interface VerifiedFoundationQuoteToken {
  quoteId: string;
  buyer: PublicKey;
  inputLamports: bigint;
  outputTokenUnits: bigint;
  expiresAt: number;
}

export function createFoundationQuoteToken(
  config: FoundationDirectConfig,
  quote: FoundationDirectQuoteResult,
  buyer: PublicKey,
): string {
  const payload: FoundationQuoteTokenPayload = {
    version: QUOTE_TOKEN_VERSION,
    mode: "FOUNDATION_DIRECT",
    quoteId: quote.quoteId,
    buyer: buyer.toBase58(),
    inputLamports: quote.inputLamports,
    outputTokenUnits: quote.outputTokenUnits,
    treasuryRecipient: config.treasuryRecipient.toBase58(),
    gtreeMint: config.gtreeMint.toBase58(),
    saleTokenAccount: config.saleTokenAccount.toBase58(),
    expiresAt: quote.expiresAt,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = signQuoteBody(body, config.saleSigner);
  return `${body}.${signature}`;
}

export function verifyFoundationQuoteToken(
  config: FoundationDirectConfig,
  token: string,
  buyer: PublicKey,
): VerifiedFoundationQuoteToken {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new Error("Refresh the Foundation quote before continuing.");
  const expectedSignature = signQuoteBody(body, config.saleSigner);
  if (!timingSafeStringEqual(signature, expectedSignature)) {
    throw new Error("Foundation quote signature is invalid.");
  }

  const payload = JSON.parse(base64UrlDecode(body)) as FoundationQuoteTokenPayload;
  if (
    payload.version !== QUOTE_TOKEN_VERSION ||
    payload.mode !== "FOUNDATION_DIRECT" ||
    payload.buyer !== buyer.toBase58() ||
    payload.treasuryRecipient !== config.treasuryRecipient.toBase58() ||
    payload.gtreeMint !== config.gtreeMint.toBase58() ||
    payload.saleTokenAccount !== config.saleTokenAccount.toBase58() ||
    !/^[1-9]\d*$/.test(payload.inputLamports) ||
    !/^[1-9]\d*$/.test(payload.outputTokenUnits)
  ) {
    throw new Error("Foundation quote does not match the configured sale.");
  }
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) {
    throw new Error("Foundation quote expired. Refresh before continuing.");
  }

  return {
    quoteId: payload.quoteId,
    buyer,
    inputLamports: BigInt(payload.inputLamports),
    outputTokenUnits: BigInt(payload.outputTokenUnits),
    expiresAt: payload.expiresAt,
  };
}

function signQuoteBody(body: string, saleSigner: Keypair): string {
  return createHmac("sha256", Buffer.from(saleSigner.secretKey)).update(body).digest("base64url");
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}
