import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function signTelegramInternalRequest(method: string, path: string, body: string, timestamp: string, nonce: string, secret = process.env.TELEGRAM_INTERNAL_API_SECRET ?? "") {
  const digest = createHash("sha256").update(body).digest("hex");
  return createHmac("sha256", secret).update([method.toUpperCase(), path, timestamp, nonce, digest].join("\n")).digest("hex");
}

export function verifyTelegramInternalRequest(request: Request, body: string): boolean {
  const secret = process.env.TELEGRAM_INTERNAL_API_SECRET?.trim();
  if (!secret || process.env.TELEGRAM_INTERNAL_API_ENABLED === "false") return false;
  const timestamp = request.headers.get("x-telegram-timestamp") ?? "";
  const nonce = request.headers.get("x-telegram-nonce") ?? "";
  const signature = request.headers.get("x-telegram-signature") ?? "";
  const age = Math.abs(Date.now() - Number(timestamp));
  const maxAge = Number(process.env.TELEGRAM_INTERNAL_API_MAX_AGE_SECONDS ?? 60) * 1000;
  if (!timestamp || !nonce || !signature || !Number.isFinite(Number(timestamp)) || age > maxAge) return false;
  const expected = signTelegramInternalRequest(request.method, new URL(request.url).pathname, body, timestamp, nonce, secret);
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
