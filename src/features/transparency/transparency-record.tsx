import Link from "next/link";
import { BadgeCheck, ExternalLink, FileText, Landmark, ScrollText } from "lucide-react";
import type { TransparencyRecord } from "@/types/transparency";
import { Badge } from "@/components/ui/badge";
import { TokenAddress } from "@/components/shared/token-address";
import { formatDate, formatUsd } from "@/lib/formatters/number";
import { explorerTxUrl } from "@/lib/constants/project";
import { ENV } from "@/lib/constants/env";
import { CATEGORY_LABELS, SOURCE_TYPE_LABELS } from "@/features/transparency/category-labels";

const SOURCE_ICON = {
  policy: ScrollText,
  "on-chain": Landmark,
  report: FileText,
} as const;

const VERIFICATION_LABEL = {
  "verified-on-chain": "Verified on-chain",
  "documented-policy": "Documented policy",
  "project-report": "Project report",
  "pending-verification": "Pending verification",
} as const;

const VERIFICATION_VARIANT = {
  "verified-on-chain": "emerald",
  "documented-policy": "neutral",
  "project-report": "info",
  "pending-verification": "gold",
} as const;

export function TransparencyRecordItem({ record }: { record: TransparencyRecord }) {
  const SourceIcon = SOURCE_ICON[record.sourceType];

  return (
    <li className="glass-surface-b flex flex-col gap-3 rounded-lg p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gt-surface-3 text-gt-emerald-bright">
            <SourceIcon className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-gt-fg">{record.title}</p>
            <p className="mt-0.5 text-xs text-gt-muted-2">
              {CATEGORY_LABELS[record.category]} · {SOURCE_TYPE_LABELS[record.sourceType]} · {formatDate(record.timestamp)}
            </p>
          </div>
        </div>
        <Badge variant={VERIFICATION_VARIANT[record.verification]}>
          <BadgeCheck className="size-3" aria-hidden />
          {VERIFICATION_LABEL[record.verification]}
        </Badge>
      </div>

      <p className="text-sm leading-relaxed text-gt-muted">{record.description}</p>

      {typeof record.amountUsd === "number" && (
        <p className="tabular text-sm font-semibold text-gt-fg">{formatUsd(record.amountUsd, { compact: true })}</p>
      )}

      {record.addresses && record.addresses.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {record.addresses.map((addr) => (
            <div key={addr.address} className="flex items-center gap-2 text-xs text-gt-muted">
              {addr.label}
              <TokenAddress address={addr.address} chars={4} />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs">
        {record.signature && (
          <a
            href={explorerTxUrl(ENV.solscanBaseUrl, record.signature)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-gt-emerald-bright hover:underline"
          >
            View transaction <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
        {record.documentSlug && (
          <Link href={`/docs#${record.documentSlug}`} className="inline-flex items-center gap-1 text-gt-emerald-bright hover:underline">
            Related document <ExternalLink className="size-3" aria-hidden />
          </Link>
        )}
      </div>
    </li>
  );
}
