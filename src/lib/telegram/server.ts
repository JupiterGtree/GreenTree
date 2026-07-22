import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getMarketSnapshot } from "@/data/market/get-market-snapshot";
import { getAdminDatabase } from "@/lib/admin/database";
import { getFoundationTransactions } from "@/lib/admin/operations-data";
import { resolveRuntimeSetting } from "@/lib/admin/runtime-settings";
import { getFoundationInventorySnapshot } from "@/lib/purchase/foundation-inventory-server";
import { SupportService } from "@/lib/support/service";
import type { SupportTopic } from "@/lib/support/repository";

type TelegramUser = { id: number; username?: string; language_code?: string };
type TelegramMessage = { message_id: number; chat: { id: number }; from?: TelegramUser; text?: string };
export type TelegramUpdate = { update_id: number; message?: TelegramMessage; callback_query?: { id: string; from: TelegramUser; message?: TelegramMessage; data?: string } };
type ConversationState = "IDLE" | "SUPPORT_CATEGORY" | "SUPPORT_MESSAGE" | "SUPPORT_REFERENCE" | "SUPPORT_CONFIRMATION";

export function telegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
  return { enabled: process.env.TELEGRAM_BOT_ENABLED === "true" && Boolean(token && secret), token, secret, salesEnabled: process.env.TELEGRAM_SALES_ENABLED === "true", supportEnabled: process.env.TELEGRAM_SUPPORT_ENABLED !== "false", miniAppUrl: process.env.TELEGRAM_MINI_APP_URL?.trim() ?? "", username: process.env.TELEGRAM_BOT_USERNAME?.trim() ?? "" };
}
export function validWebhookSecret(value: string | null) { const expected = telegramConfig().secret; if (!expected || !value) return false; return value.length === expected.length && timingSafeEqual(Buffer.from(value), Buffer.from(expected)); }
export function hashTelegram(value: string) { const secret = process.env.ADMIN_IP_HMAC_SECRET ?? ""; if (secret.length < 32) throw new Error("Telegram identity hashing is unavailable."); return createHmac("sha256", secret).update(`telegram\0${value}`).digest("hex"); }
export function telegramEnabled() { return telegramConfig().enabled; }

export async function telegramApi(method: string, body: Record<string, unknown>) {
  const config = telegramConfig(); if (!config.enabled) throw new Error("Telegram bot is not configured.");
  const response = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8_000) });
  const json = await response.json().catch(() => null) as { ok?: boolean; result?: unknown; description?: string } | null;
  const db = getAdminDatabase(); db.db.prepare("INSERT INTO telegram_runtime_state (key, value, updated_at) VALUES ('last_bot_request', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").run(response.ok && json?.ok ? "ok" : "failed", Date.now());
  if (!response.ok || !json?.ok) throw new Error(`Telegram request failed: ${json?.description ?? response.status}`);
  return json.result;
}

export async function processTelegramUpdate(update: TelegramUpdate) {
  const db = getAdminDatabase();
  try { db.db.prepare("INSERT INTO telegram_updates (update_id, received_at) VALUES (?, ?)").run(update.update_id, Date.now()); } catch { return { duplicate: true }; }
  const message = update.message ?? update.callback_query?.message; const user = update.message?.from ?? update.callback_query?.from;
  if (!message || !user) return { ignored: true };
  const chatId = String(message.chat.id); const userHash = hashTelegram(String(user.id));
  const text = (update.message?.text ?? update.callback_query?.data ?? "").trim();
  if (text === "/cancel") { clearConversation(userHash); await send(chatId, "Support flow cancelled."); return { cancelled: true }; }
  const conversation = getConversation(userHash);
  if (conversation?.state.startsWith("SUPPORT")) return processSupport(chatId, user, userHash, text, conversation);
  if (text === "/start" || text === "/help" || text === "❔ Help") return send(chatId, "Welcome to Green Tree. Choose an action below.");
  if (text === "/price" || text === "📈 Live Price") return price(chatId);
  if (text === "/activity" || text === "🧾 Recent Activity") return activity(chatId);
  if (text === "/buy" || text === "🛒 Buy GTREE") return buy(chatId);
  if (text === "/support" || text === "🛟 Support") { if (!telegramConfig().supportEnabled) return send(chatId, "Telegram Support is temporarily unavailable."); setConversation(userHash, chatId, user.username, "SUPPORT_CATEGORY", {}); return send(chatId, "Choose a support category:", categories()); }
  if (text === "/status" || text === "🟢 Service Status") return send(chatId, `Bot: ${telegramEnabled() ? "LIVE" : "UNAVAILABLE"}\nSales: ${telegramConfig().salesEnabled && resolveRuntimeSetting("purchaseMode") === "FOUNDATION_DIRECT" ? "AVAILABLE" : "PAUSED"}\nSupport: ${telegramConfig().supportEnabled ? "AVAILABLE" : "UNAVAILABLE"}`);
  return send(chatId, "Please choose an action from the menu below.");
}

async function price(chatId: string) { const result = await getMarketSnapshot(); if (result.status !== "ready" || !result.data) return send(chatId, "Market data is currently unavailable."); const data = result.data; return send(chatId, `GTREE live market\nGTREE/USD: $${data.gtreeUsd}\nGTREE/SOL: ${data.priceSol} SOL\nSOL/USD: $${data.solUsd}\nStatus: ${result.stale ? "STALE" : "LIVE"}\nUpdated: ${data.fetchedAt}`, { inline_keyboard: [[{ text: "View Market", url: "https://gtree.land/market" }]] }); }
async function activity(chatId: string) { const result = getFoundationTransactions({ view: "CONFIRMED", pageSize: 5 }); const rows = result.available ? result.items : []; const content = rows.length ? rows.map((row) => `${short(row.buyer)} · ${format(row.inputLamports)} SOL · ${format(row.outputTokenUnits)} GTREE\n${new Date(row.confirmedAt ?? row.createdAt).toLocaleString()}${row.signature ? `\nhttps://solscan.io/tx/${row.signature}` : ""}`).join("\n\n") : "No confirmed Foundation purchases have been recorded yet."; return send(chatId, content); }
async function buy(chatId: string) { const config = telegramConfig(); if (!config.salesEnabled || resolveRuntimeSetting("purchaseMode") !== "FOUNDATION_DIRECT") return send(chatId, "Sales through Telegram are temporarily unavailable. You can still view the market or contact Support."); const inventory = await getFoundationInventorySnapshot().catch(() => null); return send(chatId, `Foundation Direct availability: ${inventory?.spendableGtree ?? "Unavailable"} GTREE`, config.miniAppUrl ? { inline_keyboard: [[{ text: "Open Buy App", web_app: { url: config.miniAppUrl } }]] } : undefined); }
async function processSupport(chatId: string, user: TelegramUser, userHash: string, text: string, state: { state: ConversationState; payload: Record<string, string> }) { if (state.state === "SUPPORT_CATEGORY") { const topic = text.replace("SUPPORT_", "") as SupportTopic; if (!["PURCHASE", "WEBSITE", "GENERAL"].includes(topic)) return send(chatId, "Choose a category using the buttons."); setConversation(userHash, chatId, user.username, "SUPPORT_MESSAGE", { topic }); return send(chatId, "Please describe the issue concisely. Never send a seed phrase or private key."); } if (state.state === "SUPPORT_MESSAGE") { if (text.length < 10) return send(chatId, "Please provide at least 10 characters."); setConversation(userHash, chatId, user.username, "SUPPORT_REFERENCE", { ...state.payload, message: text }); return send(chatId, "Optional: send an order ID, transaction signature, or wallet address. Send - to skip."); } const result = new SupportService().submitTelegram({ userHash, chatId, chatHash: hashTelegram(chatId), username: user.username, topic: state.payload.topic as SupportTopic, message: state.payload.message, reference: text === "-" ? undefined : text }); clearConversation(userHash); return send(chatId, `${result.duplicate ? "Your matching ticket already exists" : "Support request received"}.\nTracking code: ${result.requestNumber}`); }
function getConversation(userHash: string) { const row = getAdminDatabase().db.prepare("SELECT state, payload_json, chat_id FROM telegram_conversations WHERE user_hash = ? AND expires_at > ?").get(userHash, Date.now()) as { state: ConversationState; payload_json: string; chat_id: string } | undefined; return row ? { state: row.state, payload: JSON.parse(row.payload_json) as Record<string, string> } : null; }
function setConversation(userHash: string, chatId: string, username: string | undefined, state: ConversationState, payload: Record<string, string>) { const now = Date.now(); getAdminDatabase().db.prepare("INSERT INTO telegram_conversations (user_hash, chat_id, username, state, payload_json, expires_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_hash) DO UPDATE SET chat_id=excluded.chat_id, username=excluded.username, state=excluded.state, payload_json=excluded.payload_json, expires_at=excluded.expires_at, updated_at=excluded.updated_at").run(userHash, chatId, username ?? null, state, JSON.stringify(payload), now + 20 * 60_000, now); }
function clearConversation(userHash: string) { getAdminDatabase().db.prepare("DELETE FROM telegram_conversations WHERE user_hash = ?").run(userHash); }
function send(chatId: string, text: string, reply_markup: Record<string, unknown> = menu()) { return telegramApi("sendMessage", { chat_id: chatId, text, reply_markup, disable_web_page_preview: true }); }
function menu() { return { keyboard: [[{ text: "🛒 Buy GTREE" }, { text: "📈 Live Price" }], [{ text: "🧾 Recent Activity" }, { text: "🛟 Support" }], [{ text: "🌐 Open Green Tree", web_app: { url: telegramConfig().miniAppUrl || "https://gtree.land" } }, { text: "🟢 Service Status" }], [{ text: "❔ Help" }]], resize_keyboard: true }; }
function categories() { return { inline_keyboard: [[{ text: "🛒 Purchase issue", callback_data: "SUPPORT_PURCHASE" }, { text: "🛠 Technical issue", callback_data: "SUPPORT_WEBSITE" }], [{ text: "🌳 Token information", callback_data: "SUPPORT_GENERAL" }], [{ text: "↩️ Cancel", callback_data: "/cancel" }]] }; }
function short(value: string) { return `${value.slice(0, 5)}…${value.slice(-4)}`; }
function format(raw: string) { const value = BigInt(raw); const whole = value / 1_000_000_000n; const fraction = (value % 1_000_000_000n).toString().padStart(9, "0").slice(0, 4).replace(/0+$/, ""); return fraction ? `${whole}.${fraction}` : whole.toString(); }
export function validateInitData(initData: string) { const token = telegramConfig().token; if (!token || !initData) return null; const params = new URLSearchParams(initData); const hash = params.get("hash"); params.delete("hash"); const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n"); const secret = createHmac("sha256", "WebAppData").update(token).digest(); const expected = createHmac("sha256", secret).update(dataCheck).digest("hex"); if (!hash || hash.length !== expected.length || !timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) return null; const authDate = Number(params.get("auth_date")); if (!Number.isFinite(authDate) || Date.now() - authDate * 1000 > 300_000) return null; const user = params.get("user"); return user ? { userHash: hashTelegram(JSON.parse(user).id.toString()), language: JSON.parse(user).language_code ?? null, sessionId: randomUUID(), expiresAt: Date.now() + 300_000 } : null; }
