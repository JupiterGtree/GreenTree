import { ExternalLink } from "lucide-react";
import type { OnchainActivityRecord } from "@/types/transaction";
import { TransactionKindIcon } from "@/features/transactions/transaction-kind-icon";
import { TransactionStatusBadge } from "@/components/shared/status-badge";
import { RelativeTime } from "@/components/shared/relative-time";
import { CopyButton } from "@/components/shared/copy-button";
import { shortenAddress } from "@/lib/constants/project";

function amountLabel(transaction: OnchainActivityRecord) {
  const parts: string[] = [];
  if (transaction.solAmount) parts.push(`${transaction.solAmount} SOL`);
  if (transaction.gtreeAmount) parts.push(`${transaction.gtreeAmount} GTREE`);
  return parts.length > 0 ? parts.join(" · ") : "Amount not derived";
}

export function TransactionCardList({ transactions }: { transactions: OnchainActivityRecord[] }) {
  return (
    <ul className="flex flex-col gap-2 sm:hidden">
      {transactions.map((tx) => (
        <li key={tx.id} className="border-y border-gt-border-soft py-4 first:border-t-0">
          <div className="flex items-start justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gt-surface-2 text-gt-emerald-bright">
                <TransactionKindIcon kind={tx.type} className="size-4" />
              </span>
              <span className="text-sm text-gt-fg">{tx.label}</span>
            </span>
            <TransactionStatusBadge status={tx.status} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="tabular text-sm font-semibold text-gt-fg">{amountLabel(tx)}</span>
            <span className="text-xs text-gt-muted">{tx.timestamp ? <RelativeTime iso={tx.timestamp} /> : "—"}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-gt-muted-2">
            {tx.buyerWallet ? (
              <span className="inline-flex items-center gap-1 font-mono">
                {shortenAddress(tx.buyerWallet, 4)}
                <CopyButton value={tx.buyerWallet} iconOnly label="Copy wallet" />
              </span>
            ) : (
              <span>—</span>
            )}
            <a
              href={tx.solscanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-gt-emerald-bright"
            >
              View on Solscan <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}
