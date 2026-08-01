import "server-only";

import type { NotificationRecord } from "@/lib/telegram/notification-outbox";

export function formatOperationsNotification(notification: NotificationRecord): string {
  const p = notification.payload;
  if (notification.eventType.startsWith("distribution_")) return formatDistributionNotification(notification);
  const label = notification.eventType.replaceAll("_", " ").toUpperCase();
  const lines = [`<b>Green Tree Operations</b>`, `<b>${escapeHtml(label)}</b>`];
  add(lines, "ID", p.quoteId ?? p.purchaseId ?? p.entityId ?? notification.entityId);
  add(lines, "Wallet", safeShort(p.wallet));
  add(lines, "SOL", p.sol ?? p.inputSol ?? p.confirmedSol);
  add(lines, "GTREE", p.gtree ?? p.outputGtree ?? p.confirmedGtree);
  add(lines, "Status", p.status);
  add(lines, "Signature", safeShort(p.transactionSignature ?? p.signature));
  if (typeof p.explorerUrl === "string") add(lines, "Solscan", p.explorerUrl);
  if (typeof p.receiptUrl === "string") add(lines, "Receipt", p.receiptUrl);
  add(lines, "Time", p.timestamp ?? p.createdAt ?? p.updatedAt);
  if (notification.eventType === "analytics_summary" && p.metrics && typeof p.metrics === "object") {
    for (const [key, value] of Object.entries(p.metrics as Record<string, unknown>)) add(lines, key, value);
  }
  if (notification.eventType === "notification_worker_warning") add(lines, "Warning", p.category);
  return lines.join("\n").slice(0, 3900);
}

function formatDistributionNotification(notification: NotificationRecord): string {
  const p = notification.payload;
  const lines = ["🌳 <b>Green Tree Admin Distribution</b>"];
  add(lines, "Status", p.status ?? notification.eventType.replace("distribution_", ""));
  add(lines, "Distribution ID", p.distributionId ?? notification.entityId);
  add(lines, "Amount", p.amountGtree ? `${p.amountGtree} GTREE` : undefined);
  add(lines, "Recipient", safeShort(p.recipient));
  add(lines, "Category", p.category);
  add(lines, "Type", p.type);
  add(lines, "Network", "Solana Mainnet");
  add(lines, "Signature", p.transactionSignature);
  add(lines, "Solscan", p.explorerUrl);
  add(lines, "Receipt ID", p.receiptId);
  add(lines, "Receipt", p.receiptUrl);
  add(lines, "OWNER Telegram ID", p.ownerTelegramId);
  add(lines, "Time", p.timestamp);
  return lines.join("\n").slice(0, 3900);
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function add(lines: string[], label: string, value: unknown) {
  if (value === null || value === undefined || value === "") return;
  const safe = typeof value === "string" && /^https?:\/\//i.test(value) ? `<a href="${escapeHtml(value)}">${escapeHtml(value)}</a>` : escapeHtml(value);
  lines.push(`<b>${escapeHtml(label)}:</b> ${safe}`);
}

function safeShort(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}
