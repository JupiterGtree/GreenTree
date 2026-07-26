"use client";

import { useState } from "react";

export function ReceiptCopyActions({
  receiptUrl,
  transactionSignature,
}: {
  receiptUrl: string;
  transactionSignature: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1800);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button type="button" className="rounded-full border border-gt-emerald/35 bg-gt-emerald/10 px-4 py-3 text-sm font-semibold text-gt-emerald-bright transition hover:bg-gt-emerald/15" onClick={() => void copy("Receipt link", receiptUrl)}>
        Copy Receipt Link
      </button>
      <button type="button" className="rounded-full border border-gt-border bg-gt-surface/70 px-4 py-3 text-sm font-semibold text-gt-fg transition hover:border-gt-emerald/40" onClick={() => void copy("Transaction ID", transactionSignature)}>
        Copy Transaction ID
      </button>
      {copied && <p className="sm:col-span-2 text-center text-xs text-gt-emerald-bright">{copied} copied.</p>}
    </div>
  );
}
