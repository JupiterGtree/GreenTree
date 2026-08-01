import "server-only";

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getMarketSnapshot } from "@/data/market/get-market-snapshot";
import { getAdminDatabase } from "@/lib/admin/database";
import { getFoundationTransactions } from "@/lib/admin/operations-data";
import { resolveRuntimeSetting } from "@/lib/admin/runtime-settings";
import { PROJECT } from "@/lib/constants/project";
import { getFoundationInventorySnapshot } from "@/lib/purchase/foundation-inventory-server";
import { SupportService } from "@/lib/support/service";
import type { SupportTopic } from "@/lib/support/repository";
import { PartnershipService, PUBLIC_PARTNERSHIP_CATEGORIES } from "@/lib/partnerships/service";
import { getOnChainGtreeBalance, getVerifiedTelegramWallet, getWalletPurchaseHistory, getWalletPurchaseSummary } from "@/lib/telegram/wallet-data";
import { enqueueNotification, getOutboxCounts } from "@/lib/telegram/notification-outbox";
import { getTelegramDatabase } from "@/lib/telegram/bot-database";
import { TokenDistributionError, TokenDistributionService, readDistributionConfig } from "@/lib/admin/token-distributions";
import type { AdminIdentity } from "@/lib/admin/auth";
import { solscanTxUrl } from "@/lib/admin/token-receipt-shared";

type TelegramUser = { id: number; username?: string; language_code?: string };
type TelegramMessage = { message_id: number; chat: { id: number; type?: string }; from?: TelegramUser; text?: string };
export type TelegramUpdate = { update_id: number; message?: TelegramMessage; callback_query?: { id: string; from: TelegramUser; message?: TelegramMessage; data?: string } };
export type ConversationState = "IDLE" | "SUPPORT_CATEGORY" | "SUPPORT_MESSAGE" | "SUPPORT_REFERENCE" | "PARTNERSHIP_CATEGORY" | "PARTNERSHIP_NAME" | "PARTNERSHIP_CONTACT" | "PARTNERSHIP_PROPOSAL" | "DISTRIBUTION_RECIPIENT" | "DISTRIBUTION_AMOUNT" | "DISTRIBUTION_CATEGORY" | "DISTRIBUTION_TYPE" | "DISTRIBUTION_NOTE" | "DISTRIBUTION_DESCRIPTION" | "DISTRIBUTION_REFERENCE";

type TelegramUrlOptions = { baseUrl?: string; path?: string };
function readBoolean(name: string, fallback: boolean) { const value = process.env[name]?.trim().toLowerCase(); return value ? value === "true" : fallback; }
export function buildTelegramWebAppUrl(options: TelegramUrlOptions = {}) {
  const rawBase = (options.baseUrl ?? process.env.TELEGRAM_WEB_APP_URL ?? PROJECT.website).trim();
  const path = options.path ?? process.env.TELEGRAM_PURCHASE_PATH ?? "/market?source=telegram_mini_app&action=buy";
  try { const base = new URL(rawBase); if (base.protocol !== "https:" || base.hostname !== "gtree.land") return null; return new URL(path, base).toString(); } catch { return null; }
}
export function telegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
  const miniAppUrl = process.env.TELEGRAM_MINI_APP_URL?.trim() || `${PROJECT.website}/telegram`;
  const purchaseUrl = buildTelegramWebAppUrl();
  const connectUrl = buildTelegramWebAppUrl({ baseUrl: miniAppUrl, path: "/telegram?flow=connect" });
  const purchaseEnabled = readBoolean("TELEGRAM_PURCHASE_ENABLED", readBoolean("TELEGRAM_SALES_ENABLED", false));
  return { enabled: readBoolean("TELEGRAM_BOT_ENABLED", false) && Boolean(token && secret), token, secret, salesEnabled: purchaseEnabled, purchaseEnabled, supportEnabled: readBoolean("TELEGRAM_SUPPORT_ENABLED", true), miniAppUrl, purchaseUrl, connectUrl, username: process.env.TELEGRAM_BOT_USERNAME?.trim() ?? "", operationsChannelId: process.env.TELEGRAM_OPERATIONS_CHANNEL_ID?.trim() ?? "", adminGroupId: process.env.TELEGRAM_ADMIN_GROUP_ID?.trim() ?? "" };
}
function numericIds(name: string) { return new Set((process.env[name] ?? "").split(",").map((v) => v.trim()).filter((v) => /^\d+$/.test(v))); }
export function isAdminChat(chatId: string) { return Boolean(telegramConfig().adminGroupId) && chatId === telegramConfig().adminGroupId; }
export function isOperationsChat(chatId: string) { return Boolean(telegramConfig().operationsChannelId) && chatId === telegramConfig().operationsChannelId; }
export function classifyTelegramChat(chatId: string, chatType: string | undefined) { if (isOperationsChat(chatId)) return "operations"; if (isAdminChat(chatId)) return "admin"; if (chatType === "private" || !chatType) return "private"; return "other_group"; }
export function isAuthorizedAdmin(userId: number, ownerOnly = false) { const ids = ownerOnly ? numericIds("TELEGRAM_OWNER_USER_IDS") : new Set([...numericIds("TELEGRAM_OWNER_USER_IDS"), ...numericIds("TELEGRAM_ADMIN_USER_IDS")]); return ids.has(String(userId)); }
export function conversationKey(userHash: string, chatId: string) { return `${userHash}:${chatId}`; }
const GLOBAL_TEXT_ACTIONS = new Set(["/start", "/buy", "/connect", "/mygtree", "/history", "/price", "/activity", "/support", "/partnership", "/status", "/help", "/admin", "/cancel", "My GTREE", "Purchase History", "🔗 Connect Wallet", "📈 Live Price", "🧾 Recent Activity", "🛒 Buy GTREE", "🛟 Support", "🤝 Partnership", "🌐 Open Green Tree", "🟢 Service Status", "❔ Help", "Back", "Cancel", "Main Menu"]);
export function isGlobalTelegramAction(value: string) { return GLOBAL_TEXT_ACTIONS.has(value.trim()); }
export function parsePublicCallback(value: string) { const match = /^public:(buy|connect_wallet|my_gtree|purchase_history|live_price|recent_activity|support|partnership|service_status|main_menu)$/.exec(value.trim()); return match?.[1] ?? null; }
export function validWebhookSecret(value: string | null) { const expected = telegramConfig().secret; if (!expected || !value) return false; return value.length === expected.length && timingSafeEqual(Buffer.from(value), Buffer.from(expected)); }
export function hashTelegram(value: string) { const secret = process.env.ADMIN_IP_HMAC_SECRET ?? ""; if (secret.length < 32) throw new Error("Telegram identity hashing is unavailable."); return createHmac("sha256", secret).update(`telegram\0${value}`).digest("hex"); }
export function telegramEnabled() { return telegramConfig().enabled; }
export async function telegramApi(method: string, body: Record<string, unknown>) {
  const config = telegramConfig(); if (!config.enabled) throw new Error("Telegram bot is not configured.");
  const response = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8_000) });
  const json = await response.json().catch(() => null) as { ok?: boolean; result?: unknown; description?: string } | null;
  try { getAdminDatabase().db.prepare("INSERT INTO telegram_runtime_state (key, value, updated_at) VALUES ('last_bot_request', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").run(response.ok && json?.ok ? "ok" : "failed", Date.now()); } catch { /* telemetry must not break the bot */ }
  if (!response.ok || !json?.ok) throw new Error(`Telegram request failed: ${json?.description ?? response.status}`);
  return json.result;
}
function runtimeValue(key: string) { try { const row = getAdminDatabase().db.prepare("SELECT value FROM telegram_runtime_state WHERE key = ?").get(key) as { value?: string } | undefined; return row?.value ?? null; } catch { return null; } }
function setRuntimeValue(key: string, value: string) { try { getAdminDatabase().db.prepare("INSERT INTO telegram_runtime_state (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").run(key, value, Date.now()); } catch { /* panel persistence must not break updates */ } }
export async function removeReplyKeyboard(chatId: string) {
  if (runtimeValue(`telegram_keyboard_removed:${chatId}`) === "1") return null;
  const result = await telegramApi("sendMessage", { chat_id: chatId, text: " ", reply_markup: { remove_keyboard: true }, disable_web_page_preview: true });
  setRuntimeValue(`telegram_keyboard_removed:${chatId}`, "1");
  return result;
}
export function adminPanelMarkup() { return { inline_keyboard: [[{ text: "Operations Summary", callback_data: "admin:summary" }, { text: "Service Health", callback_data: "admin:health" }], [{ text: "Pending Quotes", callback_data: "admin:quotes:pending" }, { text: "Recent Purchases", callback_data: "admin:purchases:recent" }], [{ text: "Recent Transactions", callback_data: "admin:transactions:recent" }, { text: "Failed Transactions", callback_data: "admin:transactions:failed" }], [{ text: "Support Queue", callback_data: "admin:support:queue" }, { text: "Partnership Queue", callback_data: "admin:partnerships:queue" }], [{ text: "Analytics Summary", callback_data: "admin:analytics" }, { text: "Distribution Balance", callback_data: "admin:distribution:balance" }], [{ text: "Manual GTREE Distribution", callback_data: "admin:distribution:create" }, { text: "Pending Distributions", callback_data: "admin:distribution:pending" }], [{ text: "Recent Distributions", callback_data: "admin:distribution:recent" }, { text: "Failed Notifications", callback_data: "admin:notifications:failed" }], [{ text: "Refresh Panel", callback_data: "admin:refresh" }]] }; }
export async function sendAdminOperationsPanel(chatId: string, user: TelegramUser, edit = false) {
  if (!isAdminChat(chatId) || !isAuthorizedAdmin(user.id)) return null;
  const text = "Green Tree Admin Operations";
  const stored = runtimeValue("telegram_admin_panel_message_id");
  if (stored || edit) {
    try { const result = await telegramApi("editMessageText", { chat_id: chatId, message_id: Number(stored), text, reply_markup: adminPanelMarkup() }) as { message_id?: number }; if (result?.message_id) { setRuntimeValue("telegram_admin_panel_message_id", String(result.message_id)); setRuntimeValue("telegram_admin_panel_updated_at", String(Date.now())); return result; } } catch (error) { if (String(error).toLowerCase().includes("not modified")) { setRuntimeValue("telegram_admin_panel_updated_at", String(Date.now())); return { message_id: Number(stored) }; } /* recreate below when Telegram message is gone */ }
  }
  const result = await telegramApi("sendMessage", { chat_id: chatId, text, reply_markup: adminPanelMarkup(), disable_web_page_preview: true }) as { message_id?: number };
  if (result?.message_id) { setRuntimeValue("telegram_admin_panel_chat_id", chatId); setRuntimeValue("telegram_admin_panel_message_id", String(result.message_id)); setRuntimeValue("telegram_admin_panel_updated_at", String(Date.now())); }
  return result;
}
async function handleAdminGroupUpdate(chatId: string, user: TelegramUser, text: string, callback = false) {
  await removeReplyKeyboard(chatId).catch(() => undefined);
  const userHash = hashTelegram(String(user.id));
  if (callback && (text.startsWith("admin:") || text.startsWith("distribution:"))) return processAdminCallback(chatId, user, text);
  if (!callback && (isGlobalTelegramAction(text) || ["Back", "Cancel", "Main Menu"].includes(text))) {
    clearConversation(userHash, chatId);
    return sendAdminOperationsPanel(chatId, user, true);
  }
  const conversation = getConversation(userHash, chatId);
  if (!callback && conversation?.state.startsWith("DISTRIBUTION_")) return processDistributionText(chatId, user, userHash, text, conversation);
  clearConversation(userHash, chatId);
  return sendAdminOperationsPanel(chatId, user, true);
}

export async function processTelegramUpdate(update: TelegramUpdate) {
  const db = getAdminDatabase();
  try { db.db.prepare("INSERT INTO telegram_updates (update_id, received_at) VALUES (?, ?)").run(update.update_id, Date.now()); } catch { return { duplicate: true }; }
  const message = update.message ?? update.callback_query?.message; const user = update.message?.from ?? update.callback_query?.from;
  if (!message || !user) return { ignored: true };
  const chatId = String(message.chat.id); const userHash = hashTelegram(String(user.id));
  if (isOperationsChat(chatId)) return { ignored: true, reason: "operations_channel_reports_only" };
  const text = (update.message?.text ?? update.callback_query?.data ?? "").trim();
  if (isAdminChat(chatId)) {
    if (update.callback_query && (text.startsWith("admin:") || text.startsWith("distribution:"))) {
      const ownerOnly = text === "admin:distribution:create" || text === "admin:distribution_create" || text.startsWith("distribution:");
      const notice = !isAuthorizedAdmin(user.id) ? "Access denied." : ownerOnly && !isAuthorizedAdmin(user.id, true) ? "OWNER authorization is required." : undefined;
      try { await telegramApi("answerCallbackQuery", { callback_query_id: update.callback_query.id, text: notice, show_alert: Boolean(notice) }); } catch { /* best effort */ }
      return handleAdminGroupUpdate(chatId, user, text, true);
    }
    return handleAdminGroupUpdate(chatId, user, text);
  }
  if (message.chat.type && message.chat.type !== "private") return send(chatId, "This chat does not have a public menu.");
  if (update.callback_query) {
    try { await telegramApi("answerCallbackQuery", { callback_query_id: update.callback_query.id }); } catch { /* best effort */ }
    const publicAction = parsePublicCallback(text);
    if (publicAction) { clearConversation(userHash, chatId); return dispatchPublicAction(publicAction, chatId, user.id, userHash, user); }
    const historyPage = parseHistoryPageCallback(text); if (historyPage !== null) return history(chatId, user.id, historyPage);
    if (text === "HISTORY_BACK") return myGtree(chatId, user.id);
    if (text === "ACTIVITY_BACK") return activity(chatId, 1);
    if (/^ACTIVITY_PAGE:[1-9]\d{0,4}$/.test(text)) return activity(chatId, Number(text.split(":")[1]));
    if (text === "support:cancel" || text === "SUPPORT_CANCEL" || text === "/cancel") { clearConversation(userHash, chatId); return send(chatId, "Flow cancelled.", mainMenuMarkup()); }
    if (/^support:category:(purchase|website|general)$/.test(text) || /^SUPPORT_(PURCHASE|WEBSITE|GENERAL)$/.test(text)) { const supportState = getConversation(userHash, chatId); return supportState?.state === "SUPPORT_CATEGORY" ? processSupport(chatId, user, userHash, text, supportState) : send(chatId, "This support step has expired.", mainMenuMarkup()); }
    if (text.startsWith("partnership:")) return processPartnershipCallback(chatId, user, userHash, text);
    if (text.startsWith("admin:")) return processAdminCallback(chatId, user, text);
  }
  if (isGlobalTelegramAction(text)) {
    clearConversation(userHash, chatId);
    if (text === "/admin") return adminPanel(chatId, user);
    if (text === "/start" || text === "/help" || text === "❔ Help" || text === "Main Menu") return send(chatId, "Welcome to Green Tree. Choose an action below.", mainMenuMarkup());
    if (text === "/buy" || text === "🛒 Buy GTREE") return buy(chatId);
    if (text === "/connect" || text === "🔗 Connect Wallet") return connectWallet(chatId);
    if (text === "/mygtree" || text === "My GTREE") return myGtree(chatId, user.id); if (text === "/history" || text === "Purchase History") return history(chatId, user.id, 1);
    if (text === "/price" || text === "📈 Live Price") return price(chatId); if (text === "/activity" || text === "🧾 Recent Activity") return activity(chatId, 1);
    if (text === "/support" || text === "🛟 Support") return startSupport(chatId, userHash, user); if (text === "/partnership" || text === "🤝 Partnership") return startPartnership(chatId, userHash, user);
    if (text === "🌐 Open Green Tree") return send(chatId, "Open Green Tree:", { inline_keyboard: [[{ text: "Open website", web_app: { url: telegramConfig().miniAppUrl } }]] });
    if (text === "/status" || text === "🟢 Service Status") return serviceStatus(chatId);
    return send(chatId, "Flow cancelled.", mainMenuMarkup());
  }
  const conversation = getConversation(userHash, chatId);
  if (conversation?.state.startsWith("SUPPORT")) return processSupport(chatId, user, userHash, text, conversation);
  if (conversation?.state.startsWith("PARTNERSHIP")) return processPartnership(chatId, user, userHash, text, conversation);
  return send(chatId, "Please choose an action from the menu below.", mainMenuMarkup());
}
async function dispatchPublicAction(action: string, chatId: string, userId: number, userHash: string, user: TelegramUser) {
  if (action === "buy") return buy(chatId); if (action === "connect_wallet") return connectWallet(chatId); if (action === "my_gtree") return myGtree(chatId, userId); if (action === "purchase_history") return history(chatId, userId, 1); if (action === "live_price") return price(chatId); if (action === "recent_activity") return activity(chatId, 1); if (action === "support") return startSupport(chatId, userHash, user); if (action === "partnership") return startPartnership(chatId, userHash, user); if (action === "service_status") return serviceStatus(chatId); return send(chatId, "Welcome to Green Tree. Choose an action below.", mainMenuMarkup());
}

async function price(chatId: string) { const result = await getMarketSnapshot(); if (result.status !== "ready" || !result.data) return send(chatId, "Market data is currently unavailable.", mainMenuMarkup()); const data = result.data; return send(chatId, `GTREE live market\nGTREE/USD: $${data.gtreeUsd}\nGTREE/SOL: ${data.priceSol} SOL\nSOL/USD: $${data.solUsd}\nStatus: ${result.stale ? "STALE" : "LIVE"}\nUpdated: ${data.fetchedAt}`, { inline_keyboard: [[{ text: "View Market", url: "https://gtree.land/market" }], [{ text: "Main Menu", callback_data: "public:main_menu" }]] }); }
async function activity(chatId: string, page = 1) { const result = getFoundationTransactions({ view: "CONFIRMED", page, pageSize: 5 }); const rows = result.available ? result.items : []; const totalPages = result.available ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1; const content = rows.length ? rows.map((row) => `${short(row.buyer)} · ${format(row.inputLamports)} SOL · ${format(row.outputTokenUnits)} GTREE\n${new Date(row.confirmedAt ?? row.createdAt).toLocaleString()}${row.signature ? `\nhttps://solscan.io/tx/${row.signature}` : ""}`).join("\n\n") : "No confirmed Foundation purchases have been recorded yet."; const buttons: Array<Array<{ text: string; callback_data: string }>> = []; if (page > 1) buttons.push([{ text: "Previous", callback_data: `ACTIVITY_PAGE:${page - 1}` }]); if (page < totalPages) buttons.push([{ text: "Next", callback_data: `ACTIVITY_PAGE:${page + 1}` }]); buttons.push([{ text: "Main Menu", callback_data: "public:main_menu" }]); return send(chatId, `Recent Foundation Activity · Page ${page}/${totalPages}\n\n${content}`, { inline_keyboard: buttons }); }
async function buy(chatId: string) { const config = telegramConfig(); if (!config.purchaseEnabled || resolveRuntimeSetting("purchaseMode") !== "FOUNDATION_DIRECT" || !config.purchaseUrl) return send(chatId, "Sales through Telegram are temporarily unavailable. You can still view the market or contact Support.", mainMenuMarkup()); const inventory = await getFoundationInventorySnapshot().catch(() => null); return send(chatId, `Foundation Direct availability: ${inventory?.spendableGtree ?? "Unavailable"} GTREE`, { inline_keyboard: [[{ text: "🛒 Open Buy GTREE", web_app: { url: config.purchaseUrl } }], [{ text: "Main Menu", callback_data: "public:main_menu" }]] }); }
async function connectWallet(chatId: string) { const config = telegramConfig(); if (!config.connectUrl) return send(chatId, "Wallet connection is temporarily unavailable. Open Green Tree in a secure browser and try again.", mainMenuMarkup()); return send(chatId, "Connect a Solana wallet to Green Tree. You will sign an ownership message only; never send a seed phrase or private key.", { inline_keyboard: [[{ text: "🔗 Connect Wallet", web_app: { url: config.connectUrl } }], [{ text: "Main Menu", callback_data: "public:main_menu" }]] }); }
async function myGtree(chatId: string, telegramUserId: number) { const wallet = getVerifiedTelegramWallet(String(telegramUserId)); if (!wallet) return send(chatId, "Connect and verify your wallet first.", { inline_keyboard: [[{ text: "🔗 Connect Wallet", callback_data: "public:connect_wallet" }], [{ text: "Main Menu", callback_data: "public:main_menu" }]] }); const summary = getWalletPurchaseSummary(wallet); const balance = await getOnChainGtreeBalance(wallet); const balanceText = balance.lookupStatus === "rpc_error" ? "Temporarily unavailable" : `${balance.gtreeBalance} GTREE`; const recent = summary.latestConfirmedPurchases.slice(0, 3).map((row) => `${format(row.gtreeTokenUnits)} GTREE · ${new Date(row.confirmedAt ?? row.createdAt).toLocaleDateString()}${row.transactionSignature ? `\nhttps://solscan.io/tx/${row.transactionSignature}` : ""}`).join("\n\n") || "No confirmed purchases yet."; return send(chatId, `Verified Wallet\n${short(wallet)}\n\nOn-chain GTREE Balance\n${balanceText}\n\nWebsite-confirmed GTREE Purchased\n${format(summary.confirmedGtreeTokenUnits)} GTREE\n\nConfirmed SOL Spent\n${format(summary.confirmedSolLamports)} SOL\n\nConfirmed Purchases: ${summary.confirmedPurchaseCount}\nPending Purchases: ${summary.pendingPurchaseCount}\n\nRecent purchases\n${recent}`, { inline_keyboard: [[{ text: "Purchase History", callback_data: "public:purchase_history" }], [{ text: "Main Menu", callback_data: "public:main_menu" }]] }); }
async function history(chatId: string, telegramUserId: number, page: number) { const wallet = getVerifiedTelegramWallet(String(telegramUserId)); if (!wallet) return send(chatId, "Connect and verify your wallet first.", { inline_keyboard: [[{ text: "🔗 Connect Wallet", callback_data: "public:connect_wallet" }], [{ text: "Main Menu", callback_data: "public:main_menu" }]] }); const result = getWalletPurchaseHistory(wallet, page, 5); if (!result.items.length) return send(chatId, "No purchases found for your verified wallet.", { inline_keyboard: [[{ text: "Back to My GTREE", callback_data: "HISTORY_BACK" }]] }); const content = result.items.map((row) => `${row.status} · ${format(row.gtreeTokenUnits)} GTREE · ${format(row.solLamports)} SOL\n${new Date(row.confirmedAt ?? row.updatedAt ?? row.createdAt).toLocaleString()}${row.transactionSignature ? `\nhttps://solscan.io/tx/${row.transactionSignature}` : ""}`).join("\n\n"); const buttons: Array<Array<{ text: string; callback_data: string }>> = []; if (result.page > 1) buttons.push([{ text: "Previous", callback_data: `HISTORY_PAGE:${result.page - 1}` }]); if (result.page < result.totalPages) buttons.push([{ text: "Next", callback_data: `HISTORY_PAGE:${result.page + 1}` }]); buttons.push([{ text: "Back to My GTREE", callback_data: "HISTORY_BACK" }]); return send(chatId, `Purchase History · Page ${result.page}/${result.totalPages}\n\n${content}`, { inline_keyboard: buttons }); }

async function startSupport(chatId: string, userHash: string, user: TelegramUser) { if (!telegramConfig().supportEnabled) return send(chatId, "Telegram Support is temporarily unavailable.", mainMenuMarkup()); setConversation(userHash, chatId, user.username, "SUPPORT_CATEGORY", {}); return send(chatId, "Choose a support category:", categories()); }
async function processSupport(chatId: string, user: TelegramUser, userHash: string, text: string, state: { state: ConversationState; payload: Record<string, string> }) { if (state.state === "SUPPORT_CATEGORY") { const topic = (text.match(/(?:support:category:|SUPPORT_)(purchase|website|general)/i)?.[1] ?? "").toUpperCase() as SupportTopic; if (!["PURCHASE", "WEBSITE", "GENERAL"].includes(topic)) return send(chatId, "Choose a category using the buttons:", categories()); setConversation(userHash, chatId, user.username, "SUPPORT_MESSAGE", { topic }); return send(chatId, "Please describe the issue concisely. Never send a seed phrase or private key.", flowControls()); } if (state.state === "SUPPORT_MESSAGE") { if (text.length < 10) return send(chatId, "Please provide at least 10 characters.", flowControls()); setConversation(userHash, chatId, user.username, "SUPPORT_REFERENCE", { ...state.payload, message: text }); return send(chatId, "Optional: send an order ID, transaction signature, or wallet address. Send - to skip.", flowControls()); } const result = new SupportService().submitTelegram({ userHash, chatId, chatHash: hashTelegram(chatId), username: user.username, topic: state.payload.topic as SupportTopic, message: state.payload.message, reference: text === "-" ? undefined : text }); try { enqueueNotification({ eventType: "support_submitted", entityType: "support_request", entityId: result.requestNumber, idempotencyKey: `support-submitted:${result.requestNumber}`, payload: { requestNumber: result.requestNumber, topic: state.payload.topic, duplicate: result.duplicate, timestamp: Date.now() } }); } catch { /* reporting is best effort */ } clearConversation(userHash, chatId); return send(chatId, `${result.duplicate ? "Your matching ticket already exists" : "Support request received"}.\nTracking code: ${result.requestNumber}`, mainMenuMarkup()); }
async function startPartnership(chatId: string, userHash: string, user: TelegramUser) { setConversation(userHash, chatId, user.username, "PARTNERSHIP_CATEGORY", {}); const buttons: Array<Array<{ text: string; callback_data: string }>> = PUBLIC_PARTNERSHIP_CATEGORIES.slice(0, 6).map((category) => [{ text: category, callback_data: `partnership:category:${category}` }]); buttons.push([{ text: "Cancel", callback_data: "support:cancel" }]); return send(chatId, "Choose a partnership category:", { inline_keyboard: buttons }); }
async function processPartnershipCallback(chatId: string, user: TelegramUser, userHash: string, text: string) { const category = /^partnership:category:([A-Z]+)$/.exec(text)?.[1]; const state = getConversation(userHash, chatId); if (!category || !state || state.state !== "PARTNERSHIP_CATEGORY" || !PUBLIC_PARTNERSHIP_CATEGORIES.includes(category as typeof PUBLIC_PARTNERSHIP_CATEGORIES[number])) return send(chatId, "This partnership step has expired.", mainMenuMarkup()); setConversation(userHash, chatId, user.username, "PARTNERSHIP_NAME", { category }); return send(chatId, "Send your name or project name.", flowControls()); }
async function processPartnership(chatId: string, user: TelegramUser, userHash: string, text: string, state: { state: ConversationState; payload: Record<string, string> }) { if (text.length < 2) return send(chatId, "Please enter a little more detail.", flowControls()); if (state.state === "PARTNERSHIP_NAME") { setConversation(userHash, chatId, user.username, "PARTNERSHIP_CONTACT", { ...state.payload, nameOrProject: text }); return send(chatId, "Send a contact handle or email.", flowControls()); } if (state.state === "PARTNERSHIP_CONTACT") { setConversation(userHash, chatId, user.username, "PARTNERSHIP_PROPOSAL", { ...state.payload, contact: text, contactType: text.includes("@") ? "EMAIL" : "TELEGRAM" }); return send(chatId, "Describe the proposal in at least 10 characters.", flowControls()); } const result = new PartnershipService().submit({ ...state.payload, proposal: text, startedAt: Date.now() - 2_000 }, "telegram"); try { enqueueNotification({ eventType: "partnership_submitted", entityType: "partnership", entityId: result.requestNumber, idempotencyKey: `partnership-submitted:${result.requestNumber}`, payload: { requestNumber: result.requestNumber, timestamp: Date.now() } }); } catch { /* best effort */ } clearConversation(userHash, chatId); return send(chatId, `Partnership request received.\nReference: ${result.requestNumber}`, mainMenuMarkup()); }

async function serviceStatus(chatId: string) { const config = telegramConfig(); return send(chatId, `Service Status\nWebsite: LIVE\nPurchase API: ${config.purchaseEnabled && resolveRuntimeSetting("purchaseMode") === "FOUNDATION_DIRECT" ? "AVAILABLE" : "PAUSED"}\nTelegram webhook: ${telegramEnabled() ? "LIVE" : "UNAVAILABLE"}\nWorker: ${process.env.TELEGRAM_NOTIFICATION_WORKER_ENABLED === "false" ? "PAUSED" : "CONFIGURED"}\nSolana RPC: CONFIGURED`, mainMenuMarkup()); }

type DistributionOperation = { id: string; telegramUserId: string; chatId: string; messageId: number | null; distributionId: string | null; state: string; payload: Record<string, unknown>; terminal: boolean };

function telegramOwnerActor(): AdminIdentity {
  const row = getAdminDatabase().db.prepare("SELECT id,email,role,display_name FROM admin_users WHERE role = 'OWNER' AND is_active = 1 ORDER BY created_at ASC LIMIT 1").get() as { id: string; email: string; role: "OWNER"; display_name: string | null } | undefined;
  if (!row) throw new TokenDistributionError("No active OWNER administrator is configured.", "CONFIGURATION");
  return { id: row.id, email: row.email, role: row.role, displayName: row.display_name };
}

function distributionOperationRow(id: string): DistributionOperation | null {
  const row = getTelegramDatabase().prepare("SELECT * FROM telegram_distribution_operations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(String(row.payload_json ?? "{}")) as Record<string, unknown>; } catch { /* safe empty state */ }
  return { id: String(row.id), telegramUserId: String(row.telegram_user_id), chatId: String(row.chat_id), messageId: row.message_id == null ? null : Number(row.message_id), distributionId: row.distribution_id == null ? null : String(row.distribution_id), state: String(row.state), payload, terminal: Number(row.terminal) === 1 };
}

function saveDistributionOperation(operation: { id: string; telegramUserId: string; chatId: string; messageId?: number | null; distributionId?: string | null; state: string; payload?: Record<string, unknown>; terminal?: boolean }) {
  const now = Date.now();
  const payload = JSON.stringify(operation.payload ?? {});
  getTelegramDatabase().prepare(`INSERT INTO telegram_distribution_operations
    (id,telegram_user_id,chat_id,message_id,distribution_id,state,payload_json,terminal,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET message_id=excluded.message_id,distribution_id=excluded.distribution_id,state=excluded.state,payload_json=excluded.payload_json,terminal=excluded.terminal,updated_at=excluded.updated_at`).run(
    operation.id, operation.telegramUserId, operation.chatId, operation.messageId ?? null, operation.distributionId ?? null,
    operation.state, payload, operation.terminal ? 1 : 0, now, now,
  );
}

async function editDistributionOperation(operationId: string, state: string, text: string, replyMarkup: Record<string, unknown> | null, patch: Record<string, unknown> = {}) {
  const current = distributionOperationRow(operationId);
  if (!current) return null;
  const nextPayload = { ...current.payload, ...patch };
  saveDistributionOperation({ id: operationId, telegramUserId: current.telegramUserId, chatId: current.chatId, messageId: current.messageId, distributionId: current.distributionId, state, payload: nextPayload, terminal: ["CONFIRMED", "FAILED", "CANCELLED", "EXPIRED"].includes(state) });
  if (current.messageId) {
    try {
      await telegramApi("editMessageText", { chat_id: current.chatId, message_id: current.messageId, text, reply_markup: replyMarkup ?? undefined, disable_web_page_preview: true });
      return current.messageId;
    } catch (error) {
      if (/not modified/i.test(String(error))) return current.messageId;
    }
  }
  const sent = await telegramApi("sendMessage", { chat_id: current.chatId, text, reply_markup: replyMarkup ?? undefined, disable_web_page_preview: true }) as { message_id?: number };
  if (sent.message_id) saveDistributionOperation({ id: operationId, telegramUserId: current.telegramUserId, chatId: current.chatId, messageId: sent.message_id, distributionId: current.distributionId, state, payload: nextPayload, terminal: ["CONFIRMED", "FAILED", "CANCELLED", "EXPIRED"].includes(state) });
  return sent.message_id ?? null;
}

function distributionCancelMarkup(operationId: string) { return { inline_keyboard: [[{ text: "Cancel", callback_data: `distribution:cancel:${operationId}` }, { text: "Back to Admin Panel", callback_data: "admin:refresh" }]] }; }
function distributionStepMarkup(operationId: string) { return distributionCancelMarkup(operationId); }
function distributionCategoryMarkup(operationId: string) {
  const categories = new TokenDistributionService().categories;
  const rows: Array<Array<{ text: string; callback_data: string }>> = categories.map((value, index) => [{ text: value, callback_data: `distribution:category:${operationId}:${index}` }]);
  rows.push(distributionCancelMarkup(operationId).inline_keyboard[0]);
  return { inline_keyboard: rows };
}
function distributionTypeMarkup(operationId: string) {
  const types = new TokenDistributionService().distributionTypes;
  const rows: Array<Array<{ text: string; callback_data: string }>> = types.map((value, index) => [{ text: value, callback_data: `distribution:type:${operationId}:${index}` }]);
  rows.push(distributionCancelMarkup(operationId).inline_keyboard[0]);
  return { inline_keyboard: rows };
}

async function startDistribution(chatId: string, user: TelegramUser) {
  if (!isAuthorizedAdmin(user.id, true)) { recordTelegramAudit(user.id, "ADMIN_OWNER_ACTION", "admin:distribution:create", "DENIED"); return null; }
  const existing = getTelegramDatabase().prepare("SELECT id FROM telegram_distribution_operations WHERE chat_id = ? AND telegram_user_id = ? AND terminal = 0 ORDER BY updated_at DESC LIMIT 1").get(chatId, String(user.id)) as { id?: string } | undefined;
  if (existing?.id) return editDistributionOperation(existing.id, "DISTRIBUTION_RECIPIENT", "🌳 New GTREE Distribution\n\nStep 1 of 7\nSend the recipient Solana wallet address.", distributionStepMarkup(existing.id));
  const id = randomUUID();
  const sent = await telegramApi("sendMessage", { chat_id: chatId, text: "🌳 New GTREE Distribution\n\nStep 1 of 7\nSend the recipient Solana wallet address.", reply_markup: distributionStepMarkup(id), disable_web_page_preview: true }) as { message_id?: number };
  saveDistributionOperation({ id, telegramUserId: String(user.id), chatId, messageId: sent.message_id ?? null, state: "DISTRIBUTION_RECIPIENT", payload: {} });
  setConversation(hashTelegram(String(user.id)), chatId, user.username, "DISTRIBUTION_RECIPIENT", { operationId: id });
  recordTelegramAudit(user.id, "ADMIN_OWNER_ACTION", "admin:distribution:create", "SUCCESS");
  return sent;
}

async function processDistributionText(chatId: string, user: TelegramUser, userHash: string, text: string, conversation: { state: ConversationState; payload: Record<string, string> }) {
  const operationId = conversation.payload.operationId;
  const operation = operationId ? distributionOperationRow(operationId) : null;
  if (!operation || operation.telegramUserId !== String(user.id) || operation.chatId !== chatId || operation.terminal) return null;
  const value = text.trim();
  if (!value || value.length > 5000) return editDistributionOperation(operation.id, operation.state, "Invalid input. Please try again.", distributionStepMarkup(operation.id));
  const payload = { ...operation.payload };
  if (conversation.state === "DISTRIBUTION_RECIPIENT") { payload.recipientWalletAddress = value; setConversation(userHash, chatId, user.username, "DISTRIBUTION_AMOUNT", { operationId }); return editDistributionOperation(operation.id, "DISTRIBUTION_AMOUNT", "🌳 New GTREE Distribution\n\nStep 2 of 7\nSend the GTREE amount (up to 9 decimals).", distributionStepMarkup(operation.id), payload); }
  if (conversation.state === "DISTRIBUTION_AMOUNT") { payload.amountGtree = value; setConversation(userHash, chatId, user.username, "DISTRIBUTION_CATEGORY", { operationId }); return editDistributionOperation(operation.id, "DISTRIBUTION_CATEGORY", "🌳 New GTREE Distribution\n\nStep 3 of 7\nChoose the allocation category.", distributionCategoryMarkup(operation.id), payload); }
  if (conversation.state === "DISTRIBUTION_NOTE") { payload.internalNote = value; setConversation(userHash, chatId, user.username, "DISTRIBUTION_DESCRIPTION", { operationId }); return editDistributionOperation(operation.id, "DISTRIBUTION_DESCRIPTION", "🌳 New GTREE Distribution\n\nStep 6 of 7\nSend the public receipt description.", distributionStepMarkup(operation.id), payload); }
  if (conversation.state === "DISTRIBUTION_DESCRIPTION") { payload.publicDescription = value; setConversation(userHash, chatId, user.username, "DISTRIBUTION_REFERENCE", { operationId }); return editDistributionOperation(operation.id, "DISTRIBUTION_REFERENCE", "🌳 New GTREE Distribution\n\nStep 7 of 7\nSend an external reference, or send - to skip.", distributionStepMarkup(operation.id), payload); }
  if (conversation.state === "DISTRIBUTION_REFERENCE") { payload.externalReference = value === "-" ? null : value; clearConversation(userHash, chatId); return createDistributionPreview(operation.id, payload, user); }
  return null;
}

async function createDistributionPreview(operationId: string, payload: Record<string, unknown>, user: TelegramUser) {
  const operation = distributionOperationRow(operationId); if (!operation) return null;
  try {
    const actor = telegramOwnerActor();
    const service = new TokenDistributionService();
    const result = await service.preview({ recipientWalletAddress: String(payload.recipientWalletAddress ?? ""), amountGtree: String(payload.amountGtree ?? ""), allocationCategory: String(payload.allocationCategory ?? ""), distributionType: String(payload.distributionType ?? ""), internalNote: payload.internalNote == null ? undefined : String(payload.internalNote), publicDescription: payload.publicDescription == null ? undefined : String(payload.publicDescription), externalReference: payload.externalReference == null ? undefined : String(payload.externalReference), idempotencyKey: `telegram-distribution:${operationId}` }, actor);
    const record = result.record; const source = result.dashboard.source;
    const token = randomBytes(16).toString("hex"); const expires = Date.now() + 60_000;
    getTelegramDatabase().prepare("INSERT INTO telegram_callback_tokens (token,telegram_user_id,entity_id,expires_at,used_at) VALUES (?,?,?,?,NULL)").run(token, String(user.id), operationId, expires);
    getTelegramDatabase().prepare("INSERT OR REPLACE INTO telegram_distribution_requests (id,telegram_user_id,state,payload_json,idempotency_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(operationId, String(user.id), "AWAITING_CONFIRMATION", JSON.stringify({ ...payload, distributionId: record.uuid, confirmationToken: token }), `telegram-distribution:${operationId}`, Date.now(), Date.now());
    const text = `🌳 GTREE Distribution Preview\n\nStatus: Awaiting OWNER Confirmation\n\nDistribution\nRequest ID: ${record.uuid}\nRecipient: ${record.recipientWalletAddress}\nGTREE Amount: ${record.amountGtree}\nAllocation Category: ${record.allocationCategory}\nDistribution Type: ${record.distributionType}\n\nInfrastructure\nSource Token Account: ${source.sourceTokenAccount}\nGTREE Mint: ${source.mint}\nCurrent Source Balance: ${source.sourceBalanceGtree} GTREE\nFee Payer: ${record.feePayerAddress ?? "Waiting"}\nFee-Payer SOL Balance: ${source.serverSignerSol} SOL\nSigner Readiness: ${source.signerConfigured && source.signerMatchesExpected ? "READY" : "NOT READY"}\n\nExecution\nNetwork: Solana Mainnet\nMode: ${readDistributionConfig().dryRun ? "DRY RUN" : "LIVE"}\nPreview Created: ${new Date(record.createdAt).toLocaleString()}\nPreview Expires: ${new Date(expires).toLocaleString()}`;
    const markup = { inline_keyboard: [[{ text: "Confirm Real Transfer", callback_data: `distribution:confirm:${token}` }], [{ text: "Edit Wallet", callback_data: `distribution:edit:wallet:${operationId}` }, { text: "Edit Amount", callback_data: `distribution:edit:amount:${operationId}` }], [{ text: "Edit Category", callback_data: `distribution:edit:category:${operationId}` }, { text: "Edit Type", callback_data: `distribution:edit:type:${operationId}` }], [{ text: "Cancel", callback_data: `distribution:cancel:${operationId}` }]] };
    saveDistributionOperation({ id: operationId, telegramUserId: operation.telegramUserId, chatId: operation.chatId, messageId: operation.messageId, distributionId: record.uuid, state: "AWAITING_CONFIRMATION", payload: { ...payload, distributionId: record.uuid, confirmationToken: token }, terminal: false });
    try { enqueueNotification({ eventType: "distribution_preview", entityType: "token_distribution", entityId: record.uuid, idempotencyKey: `distribution:${record.uuid}:preview`, payload: { distributionId: record.uuid, amountGtree: record.amountGtree, recipient: record.recipientWalletAddress, category: record.allocationCategory, type: record.distributionType, ownerTelegramId: user.id, status: "Preview", timestamp: Date.now() } }); } catch { /* reporting is best effort */ }
    return editDistributionOperation(operationId, "AWAITING_CONFIRMATION", text, markup, { distributionId: record.uuid, confirmationToken: token });
  } catch (error) {
    const message = error instanceof TokenDistributionError ? error.message : "Preview could not be created.";
    return editDistributionOperation(operationId, "DISTRIBUTION_REFERENCE", `🌳 Distribution Preview Failed\n\n${message}\n\nCorrect the input and try again, or cancel.`, distributionStepMarkup(operationId));
  }
}

async function executeDistribution(operationId: string, user: TelegramUser) {
  const operation = distributionOperationRow(operationId); if (!operation?.distributionId) return null;
  const actor = telegramOwnerActor();
  const service = new TokenDistributionService();
  const config = readDistributionConfig();
  if (!config.enabled || config.dryRun) return editDistributionOperation(operationId, "FAILED", "🌳 GTREE Distribution\n\n❌ Real execution is disabled. No transaction was submitted.\nEnable live distribution configuration before confirming.", { inline_keyboard: [[{ text: "Back to Admin Panel", callback_data: "admin:refresh" }]] });
  await editDistributionOperation(operationId, "SUBMITTING", "🌳 Green Tree Admin Distribution\n\n⏳ Submitting transaction to Solana Mainnet…", null);
  try {
    const result = await service.submitServerFeePayer(operation.distributionId, config.confirmationPhrase, actor);
    if (!result.transactionSignature) throw new TokenDistributionError("Transaction signature was not returned.", "SIGNATURE");
    try { enqueueNotification({ eventType: "distribution_submitted", entityType: "token_distribution", entityId: operation.distributionId, idempotencyKey: `distribution:${operation.distributionId}:submitted`, payload: { distributionId: operation.distributionId, amountGtree: result.amountGtree, recipient: result.recipientWalletAddress, ownerTelegramId: user.id, status: "Submitted", transactionSignature: result.transactionSignature, explorerUrl: solscanTxUrl(result.transactionSignature), timestamp: Date.now() } }); } catch { /* best effort */ }
    await editDistributionOperation(operationId, "SUBMITTED", `🌳 Green Tree Admin Distribution\n\n⏳ Transaction submitted. Waiting for confirmation…\n\nDistribution ID: ${result.uuid}\nSignature: ${result.transactionSignature}\nSolscan: ${solscanTxUrl(result.transactionSignature)}`, { inline_keyboard: [[{ text: "View on Solscan", url: solscanTxUrl(result.transactionSignature) }]] });
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      await service.reconcile(actor).catch(() => undefined);
      const current = service.get(operation.distributionId, actor);
      if (current.status === "confirmed" || current.status === "failed") {
        const receipt = current.receipt;
        if (current.status === "confirmed") {
          const confirmedPayload = { distributionId: current.uuid, amountGtree: current.amountGtree, recipient: current.recipientWalletAddress, category: current.allocationCategory, type: current.distributionType, ownerTelegramId: user.id, status: "Confirmed", transactionSignature: current.transactionSignature, explorerUrl: current.transactionSignature ? solscanTxUrl(current.transactionSignature) : undefined, receiptId: receipt?.publicId, receiptUrl: receipt?.publicUrl, timestamp: current.updatedAt };
          try { enqueueNotification({ eventType: "distribution_confirmed", entityType: "token_distribution", entityId: current.uuid, idempotencyKey: `distribution:${current.uuid}:confirmed`, payload: confirmedPayload }); } catch { /* best effort */ }
          if (receipt) { try { enqueueNotification({ eventType: "distribution_receipt_generated", entityType: "token_distribution", entityId: current.uuid, idempotencyKey: `distribution:${current.uuid}:receipt:${receipt.publicId}`, payload: { ...confirmedPayload, status: "Receipt Generated" } }); } catch { /* best effort */ } }
          return editDistributionOperation(operationId, "CONFIRMED", `🌳 Green Tree Admin Distribution\n\n✅ Status: Confirmed\n\nDistribution ID: ${current.uuid}\nRecipient Wallet: ${current.recipientWalletAddress}\nGTREE Amount: ${current.amountGtree}\nAllocation Category: ${current.allocationCategory}\nDistribution Type: ${current.distributionType}\n\nNetwork: Solana Mainnet\nFull Transaction Signature: ${current.transactionSignature}\nConfirmed: ${new Date(current.updatedAt).toLocaleString()}\n\nOfficial Receipt ID: ${receipt?.publicId ?? "Pending"}\nOfficial Receipt URL: ${receipt?.publicUrl ?? "Pending"}\nOWNER Telegram ID: ${user.id}`, { inline_keyboard: [[{ text: "View on Solscan", url: solscanTxUrl(current.transactionSignature!) }, ...(receipt?.publicUrl ? [{ text: "View Official Receipt", url: receipt.publicUrl }] : [])], [{ text: "Back to Admin Panel", callback_data: "admin:refresh" }]] });
        }
        try { enqueueNotification({ eventType: "distribution_failed", entityType: "token_distribution", entityId: current.uuid, idempotencyKey: `distribution:${current.uuid}:failed`, payload: { distributionId: current.uuid, amountGtree: current.amountGtree, recipient: current.recipientWalletAddress, ownerTelegramId: user.id, status: "Failed", transactionSignature: current.transactionSignature, explorerUrl: current.transactionSignature ? solscanTxUrl(current.transactionSignature) : undefined, timestamp: current.updatedAt } }); } catch { /* best effort */ }
        return editDistributionOperation(operationId, "FAILED", `🌳 Green Tree Admin Distribution\n\n❌ Status: Failed\n\nDistribution ID: ${current.uuid}\nTransaction submitted: Yes\nSignature: ${current.transactionSignature ?? "Unavailable"}\nReason: ${current.failureReason ?? "On-chain transaction failed."}`, { inline_keyboard: [[{ text: "Back to Admin Panel", callback_data: "admin:refresh" }]] });
      }
    }
    return editDistributionOperation(operationId, "SUBMITTED", "🌳 Green Tree Admin Distribution\n\n⏳ Transaction submitted. Confirmation is still pending.\nThe worker/reconciliation process will update the record.", { inline_keyboard: [[{ text: "View on Solscan", url: solscanTxUrl(result.transactionSignature) }], [{ text: "Back to Admin Panel", callback_data: "admin:refresh" }]] });
  } catch (error) {
    const message = error instanceof TokenDistributionError ? error.message : "Distribution execution failed.";
    try { enqueueNotification({ eventType: "distribution_failed", entityType: "token_distribution", entityId: operation.distributionId, idempotencyKey: `distribution:${operation.distributionId}:failed`, payload: { distributionId: operation.distributionId, ownerTelegramId: user.id, status: "Failed", errorCategory: message, timestamp: Date.now() } }); } catch { /* best effort */ }
    return editDistributionOperation(operationId, "FAILED", `🌳 Green Tree Admin Distribution\n\n❌ ${message}\nTransaction submitted: No confirmation available.`, { inline_keyboard: [[{ text: "Back to Admin Panel", callback_data: "admin:refresh" }]] });
  }
}

async function processAdminCallback(chatId: string, user: TelegramUser, text: string) {
  if (!isAdminChat(chatId) || !isAuthorizedAdmin(user.id)) { recordTelegramAudit(user.id, "ADMIN_CALLBACK", text, "DENIED"); return null; }
  recordTelegramAudit(user.id, "ADMIN_CALLBACK", text, "SUCCESS");
  if (text === "admin:refresh") return sendAdminOperationsPanel(chatId, user, true);
  if (text === "admin:distribution:create" || text === "admin:distribution_create") {
    if (!isAuthorizedAdmin(user.id, true)) { recordTelegramAudit(user.id, "ADMIN_OWNER_ACTION", text, "DENIED"); return null; }
    return startDistribution(chatId, user);
  }
  const confirmMatch = /^distribution:confirm:([a-f0-9]{32})$/.exec(text);
  if (confirmMatch) {
    if (!isAuthorizedAdmin(user.id, true)) { recordTelegramAudit(user.id, "ADMIN_OWNER_ACTION", text, "DENIED"); return null; }
    const token = confirmMatch[1];
    const db = getTelegramDatabase();
    const callback = db.prepare("SELECT entity_id FROM telegram_callback_tokens WHERE token = ? AND telegram_user_id = ? AND used_at IS NULL AND expires_at > ?").get(token, String(user.id), Date.now()) as { entity_id?: string } | undefined;
    if (!callback?.entity_id) return null;
    const used = db.prepare("UPDATE telegram_callback_tokens SET used_at = ? WHERE token = ? AND telegram_user_id = ? AND used_at IS NULL AND expires_at > ?").run(Date.now(), token, String(user.id), Date.now());
    if (used.changes !== 1) return null;
    const op = distributionOperationRow(callback.entity_id);
    if (!op || op.chatId !== chatId || op.telegramUserId !== String(user.id) || op.state !== "AWAITING_CONFIRMATION") return null;
    const locked = db.prepare("UPDATE telegram_distribution_operations SET state = 'SUBMITTING', updated_at = ? WHERE id = ? AND state = 'AWAITING_CONFIRMATION' AND terminal = 0").run(Date.now(), op.id);
    if (locked.changes !== 1) return editDistributionOperation(op.id, op.state, "This distribution is already processing.", null);
    recordTelegramAudit(user.id, "ADMIN_OWNER_ACTION", "distribution:confirm", "SUCCESS");
    return executeDistribution(op.id, user);
  }
  const cancelMatch = /^distribution:cancel:([0-9a-f-]{36})$/.exec(text);
  if (cancelMatch) {
    const op = distributionOperationRow(cancelMatch[1]);
    if (!op || op.chatId !== chatId || op.telegramUserId !== String(user.id) || op.terminal) return null;
    if (op.distributionId) { try { await new TokenDistributionService().cancel(op.distributionId, telegramOwnerActor()); } catch { /* cancellation is idempotent at Telegram layer */ } }
    clearConversation(hashTelegram(String(user.id)), chatId);
    return editDistributionOperation(op.id, "CANCELLED", "🌳 GTREE Distribution\n\nCancelled. No transaction was submitted.", { inline_keyboard: [[{ text: "Back to Admin Panel", callback_data: "admin:refresh" }]] });
  }
  const categoryMatch = /^distribution:category:([0-9a-f-]{36}):(\d+)$/.exec(text);
  if (categoryMatch) {
    const op = distributionOperationRow(categoryMatch[1]); const index = Number(categoryMatch[2]); const service = new TokenDistributionService();
    if (!op || op.telegramUserId !== String(user.id) || op.chatId !== chatId || op.state !== "DISTRIBUTION_CATEGORY" || !service.categories[index]) return null;
    const payload = { ...op.payload, allocationCategory: service.categories[index] }; setConversation(hashTelegram(String(user.id)), chatId, user.username, "DISTRIBUTION_TYPE", { operationId: op.id });
    return editDistributionOperation(op.id, "DISTRIBUTION_TYPE", `🌳 New GTREE Distribution\n\nStep 4 of 7\nChoose the distribution type.\nSelected category: ${service.categories[index]}`, distributionTypeMarkup(op.id), payload);
  }
  const typeMatch = /^distribution:type:([0-9a-f-]{36}):(\d+)$/.exec(text);
  if (typeMatch) {
    const op = distributionOperationRow(typeMatch[1]); const index = Number(typeMatch[2]); const service = new TokenDistributionService();
    if (!op || op.telegramUserId !== String(user.id) || op.chatId !== chatId || op.state !== "DISTRIBUTION_TYPE" || !service.distributionTypes[index]) return null;
    const payload = { ...op.payload, distributionType: service.distributionTypes[index] }; setConversation(hashTelegram(String(user.id)), chatId, user.username, "DISTRIBUTION_NOTE", { operationId: op.id });
    return editDistributionOperation(op.id, "DISTRIBUTION_NOTE", "🌳 New GTREE Distribution\n\nStep 5 of 7\nSend the private internal note.", distributionStepMarkup(op.id), payload);
  }
  const editMatch = /^distribution:edit:(wallet|amount|category|type):([0-9a-f-]{36})$/.exec(text);
  if (editMatch) {
    const op = distributionOperationRow(editMatch[2]); if (!op || op.telegramUserId !== String(user.id) || op.chatId !== chatId || op.state !== "AWAITING_CONFIRMATION") return null;
    const state = editMatch[1] === "wallet" ? "DISTRIBUTION_RECIPIENT" : editMatch[1] === "amount" ? "DISTRIBUTION_AMOUNT" : editMatch[1] === "category" ? "DISTRIBUTION_CATEGORY" : "DISTRIBUTION_TYPE";
    setConversation(hashTelegram(String(user.id)), chatId, user.username, state as ConversationState, { operationId: op.id });
    if (state === "DISTRIBUTION_CATEGORY") return editDistributionOperation(op.id, state, "Choose the allocation category.", distributionCategoryMarkup(op.id));
    if (state === "DISTRIBUTION_TYPE") return editDistributionOperation(op.id, state, "Choose the distribution type.", distributionTypeMarkup(op.id));
    return editDistributionOperation(op.id, state, state === "DISTRIBUTION_RECIPIENT" ? "Send the recipient Solana wallet address." : "Send the GTREE amount.", distributionStepMarkup(op.id));
  }
  if (text === "admin:summary" || text === "admin:dashboard") { const data = getFoundationTransactions({ view: "ALL", page: 1, pageSize: 1 }); const counts = getOutboxCounts(); return sendAdminResult(chatId, `Operations Summary\nFoundation records: ${data.available ? data.total : "Unavailable"}\nConfirmed: ${data.available ? data.summary.confirmedCount : "Unavailable"}\nOutbox pending/retry/dead: ${counts.pending}/${counts.retry}/${counts.deadLetter}`); }
  if (text === "admin:health") return sendAdminResult(chatId, `Service Health\nWebsite: LIVE\nWebhook: ${telegramEnabled() ? "LIVE" : "UNAVAILABLE"}\nWorker: ${process.env.TELEGRAM_NOTIFICATION_WORKER_ENABLED === "false" ? "PAUSED" : "ONLINE"}\nSolana RPC: CONFIGURED`);
  if (text === "admin:distribution:balance" || text === "admin:distribution_balance") { const inventory = await getFoundationInventorySnapshot().catch(() => null); return sendAdminResult(chatId, `Distribution Balance\nSource balance: ${inventory?.spendableGtree ?? "Unavailable"} GTREE\nExecution: ${process.env.TELEGRAM_DISTRIBUTION_DRY_RUN === "true" ? "DRY RUN" : "DISABLED"}`); }
  if (text === "admin:analytics") return sendAdminResult(chatId, "Analytics Summary\nUse the Website Analytics dashboard for the full period breakdown.");
  if (text === "admin:quotes:pending" || text === "admin:quotes") return sendAdminResult(chatId, "Pending Quotes\n" + adminTransactions("PENDING"));
  if (text === "admin:purchases:recent" || text === "admin:purchases") return sendAdminResult(chatId, "Recent Purchases\n" + adminTransactions("CONFIRMED"));
  if (text === "admin:transactions:recent" || text === "admin:transactions") return sendAdminResult(chatId, "Recent Transactions\n" + adminTransactions("ALL"));
  if (text === "admin:transactions:failed" || text === "admin:transactions_failed") return sendAdminResult(chatId, "Failed Transactions\n" + adminTransactions("FAILED"));
  if (text === "admin:support:queue" || text === "admin:support") return sendAdminResult(chatId, "Support Queue\n" + adminCount("support_requests", "status NOT IN ('RESOLVED','CLOSED')"));
  if (text === "admin:partnerships:queue" || text === "admin:partnerships") return sendAdminResult(chatId, "Partnership Queue\n" + adminCount("partnership_requests", "status NOT IN ('COMPLETED','REJECTED')"));
  if (text === "admin:notifications:failed" || text === "admin:notifications_failed") return sendAdminResult(chatId, `Failed Notifications\nDead-letter: ${getOutboxCounts().deadLetter}`);
  if (text === "admin:distribution:pending" || text === "admin:distribution_pending" || text === "admin:distribution:recent" || text === "admin:distribution_recent") return sendAdminResult(chatId, "Distribution records remain available to OWNER operators; dry-run mode is active.");
  return sendAdminResult(chatId, "This admin action is not available.");
}
async function sendNoMenu(chatId: string, text: string) { return telegramApi("sendMessage", { chat_id: chatId, text, reply_markup: { remove_keyboard: true }, disable_web_page_preview: true }); }
async function sendAdminResult(chatId: string, text: string) {
  const key = `telegram_admin_operation_message_id:${chatId}`;
  const stored = runtimeValue(key);
  if (stored) {
    try { await telegramApi("editMessageText", { chat_id: chatId, message_id: Number(stored), text, reply_markup: adminBack(), disable_web_page_preview: true }); return { message_id: Number(stored) }; } catch { /* recreate only if the stored message is gone */ }
  }
  const result = await telegramApi("sendMessage", { chat_id: chatId, text, reply_markup: adminBack(), disable_web_page_preview: true }) as { message_id?: number };
  if (result.message_id) setRuntimeValue(key, String(result.message_id));
  return result;
}
function recordTelegramAudit(userId: number, action: string, entityId: string, result: "SUCCESS" | "DENIED") { try { getTelegramDatabase().prepare("INSERT INTO telegram_audit_logs (id, telegram_user_id, action, entity_type, entity_id, result, created_at) VALUES (lower(hex(randomblob(16))), ?, ?, 'admin_callback', ?, ?, ?)").run(String(userId), action, entityId.slice(0, 160), result, Date.now()); } catch { /* audit failure must not change authorization outcome */ } }
function adminTransactions(view: "PENDING" | "CONFIRMED" | "FAILED" | "ALL") { const result = getFoundationTransactions({ view, page: 1, pageSize: 5 }); if (!result.available || !result.items.length) return "No records."; return result.items.map((row) => `${short(row.buyer)} · ${format(row.inputLamports)} SOL · ${row.state} · ${new Date(row.createdAt).toLocaleString()}`).join("\n"); }
function adminCount(table: string, where: string) { try { const row = getAdminDatabase().db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`).get() as { count: number }; return String(row.count); } catch { return "Unavailable"; } }
function adminBack() { return { inline_keyboard: [[{ text: "Refresh Panel", callback_data: "admin:refresh" }]] }; }
async function adminPanel(chatId: string, user: TelegramUser) { return sendAdminOperationsPanel(chatId, user, true); }
function getConversation(userHash: string, chatId: string) { const row = getAdminDatabase().db.prepare("SELECT state, payload_json FROM telegram_conversations WHERE user_hash = ? AND chat_id = ? AND expires_at > ?").get(userHash, chatId, Date.now()) as { state: ConversationState; payload_json: string } | undefined; if (!row) return null; try { return { state: row.state, payload: JSON.parse(row.payload_json) as Record<string, string> }; } catch { return null; } }
function setConversation(userHash: string, chatId: string, username: string | undefined, state: ConversationState, payload: Record<string, string>) { const now = Date.now(); getAdminDatabase().db.prepare("INSERT INTO telegram_conversations (user_hash, chat_id, username, state, payload_json, expires_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_hash, chat_id) DO UPDATE SET username=excluded.username, state=excluded.state, payload_json=excluded.payload_json, expires_at=excluded.expires_at, updated_at=excluded.updated_at").run(userHash, chatId, username ?? null, state, JSON.stringify(payload), now + 20 * 60_000, now); }
function clearConversation(userHash: string, chatId: string) { getAdminDatabase().db.prepare("DELETE FROM telegram_conversations WHERE user_hash = ? AND chat_id = ?").run(userHash, chatId); }
function send(chatId: string, text: string, reply_markup: Record<string, unknown> = telegramMenu()) { return telegramApi("sendMessage", { chat_id: chatId, text, reply_markup, disable_web_page_preview: true }); }
export function telegramMenu() { const config = telegramConfig(); return { keyboard: [[{ text: "🛒 Buy GTREE", web_app: config.purchaseUrl ? { url: config.purchaseUrl } : undefined }, { text: "📈 Live Price" }], [{ text: "🔗 Connect Wallet", web_app: config.connectUrl ? { url: config.connectUrl } : undefined }, { text: "My GTREE" }], [{ text: "Purchase History" }, { text: "🧾 Recent Activity" }], [{ text: "🛟 Support" }, { text: "🤝 Partnership" }], [{ text: "🌐 Open Green Tree", web_app: { url: config.miniAppUrl } }, { text: "🟢 Service Status" }], [{ text: "❔ Help" }]], resize_keyboard: true, is_persistent: true }; }
function mainMenuMarkup() { return { inline_keyboard: [[{ text: "🛒 Buy GTREE", callback_data: "public:buy" }, { text: "🔗 Connect Wallet", callback_data: "public:connect_wallet" }], [{ text: "My GTREE", callback_data: "public:my_gtree" }, { text: "Purchase History", callback_data: "public:purchase_history" }], [{ text: "📈 Live Price", callback_data: "public:live_price" }, { text: "🧾 Recent Activity", callback_data: "public:recent_activity" }], [{ text: "🛟 Support", callback_data: "public:support" }, { text: "🤝 Partnership", callback_data: "public:partnership" }], [{ text: "🟢 Service Status", callback_data: "public:service_status" }]] }; }
function flowControls() { return { inline_keyboard: [[{ text: "Cancel", callback_data: "support:cancel" }, { text: "Main Menu", callback_data: "public:main_menu" }]] }; }
function categories() { return { inline_keyboard: [[{ text: "🛒 Purchase issue", callback_data: "support:category:purchase" }, { text: "🛠 Technical issue", callback_data: "support:category:website" }], [{ text: "🌳 Token information", callback_data: "support:category:general" }], [{ text: "Cancel", callback_data: "support:cancel" }]] }; }
function short(value: string) { return `${value.slice(0, 5)}…${value.slice(-4)}`; }
function format(raw: string, decimals = 9) { const value = BigInt(raw); const scale = 10n ** BigInt(decimals); const whole = value / scale; const fraction = (value % scale).toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, ""); return fraction ? `${whole}.${fraction}` : whole.toString(); }
export function parseHistoryPageCallback(value: string): number | null { const match = /^HISTORY_PAGE:([1-9]\d{0,5})$/.exec(value.trim()); if (!match) return null; const page = Number(match[1]); return page >= 1 && page <= 100_000 ? page : null; }
export function parseDistributionCallback(value: string) {
  const text = value.trim();
  const confirm = /^distribution:confirm:([a-f0-9]{32})$/.exec(text); if (confirm) return { action: "confirm" as const, token: confirm[1] };
  const cancel = /^distribution:cancel:([0-9a-f-]{36})$/.exec(text); if (cancel) return { action: "cancel" as const, operationId: cancel[1] };
  const category = /^distribution:category:([0-9a-f-]{36}):(\d+)$/.exec(text); if (category) return { action: "category" as const, operationId: category[1], index: Number(category[2]) };
  const type = /^distribution:type:([0-9a-f-]{36}):(\d+)$/.exec(text); if (type) return { action: "type" as const, operationId: type[1], index: Number(type[2]) };
  const edit = /^distribution:edit:(wallet|amount|category|type):([0-9a-f-]{36})$/.exec(text); if (edit) return { action: "edit" as const, field: edit[1], operationId: edit[2] };
  return null;
}
export function validateInitData(initData: string) { const token = telegramConfig().token; if (!token || !initData) return null; const params = new URLSearchParams(initData); const hash = params.get("hash"); params.delete("hash"); const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n"); const secret = createHmac("sha256", "WebAppData").update(token).digest(); const expected = createHmac("sha256", secret).update(dataCheck).digest("hex"); if (!hash || hash.length !== expected.length || !timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) return null; const authDate = Number(params.get("auth_date")); if (!Number.isFinite(authDate) || Date.now() - authDate * 1_000 > 300_000) return null; try { const user = JSON.parse(params.get("user") ?? "") as { id?: number; username?: string; language_code?: string }; if (!Number.isSafeInteger(user.id) || user.id! < 0) return null; return { telegramUserId: String(user.id), userHash: hashTelegram(String(user.id)), username: user.username, language: user.language_code ?? null, sessionId: randomUUID(), expiresAt: Date.now() + 300_000 }; } catch { return null; } }
