import { ExternalLink } from "lucide-react";
import type { OnchainActivityRecord } from "@/types/transaction";
import { TransactionKindIcon } from "@/features/transactions/transaction-kind-icon";
import { TransactionStatusBadge } from "@/components/shared/status-badge";
import { RelativeTime } from "@/components/shared/relative-time";
import { CopyButton } from "@/components/shared/copy-button";
import { shortenAddress } from "@/lib/constants/project";

function amountCell(transaction: OnchainActivityRecord) {
  const parts: string[] = [];
  if (transaction.solAmount) parts.push(`${transaction.solAmount} SOL`);
  if (transaction.gtreeAmount) parts.push(`${transaction.gtreeAmount} GTREE`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function TransactionTable({ transactions }: { transactions: OnchainActivityRecord[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-md border border-gt-border sm:block">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gt-border bg-gt-surface text-xs text-gt-muted">
            <th scope="col" className="px-4 py-3 font-medium">Type</th>
            <th scope="col" className="px-4 py-3 font-medium">Amount</th>
            <th scope="col" className="px-4 py-3 font-medium">Wallet</th>
            <th scope="col" className="px-4 py-3 font-medium">Time</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
            <th scope="col" className="px-4 py-3 font-medium text-right">Explorer</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gt-border-soft">
          {transactions.map((tx) => (
            <tr key={tx.id} className="bg-gt-charcoal-2 transition-colors hover:bg-gt-surface/60">
              <td className="px-4 py-3">
                <span className="flex items-center gap-2">
                  <TransactionKindIcon kind={tx.type} className="size-4 text-gt-emerald-bright" />
                  <span className="text-gt-fg">{tx.label}</span>
                </span>
              </td>
              <td className="tabular px-4 py-3 text-gt-fg">{amountCell(tx)}</td>
              <td className="px-4 py-3">
                {tx.buyerWallet ? (
                  <span className="inline-flex items-center gap-1 font-mono text-xs text-gt-muted">
                    {shortenAddress(tx.buyerWallet, 4)}
                    <CopyButton value={tx.buyerWallet} iconOnly label="Copy wallet" />
                  </span>
                ) : (
                  <span className="text-xs text-gt-muted">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-gt-muted">
                {tx.timestamp ? <RelativeTime iso={tx.timestamp} /> : "—"}
              </td>
              <td className="px-4 py-3">
                <TransactionStatusBadge status={tx.status} />
              </td>
              <td className="px-4 py-3 text-right">
                <a
                  href={tx.solscanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="View transaction on Solscan"
                  className="inline-flex items-center gap-1 rounded-md p-1.5 text-gt-muted transition-colors hover:bg-gt-surface-2 hover:text-gt-emerald-bright"
                >
                  <span className="text-xs">View on Solscan</span>
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
