"use client";

import * as React from "react";
import { FileSearch } from "lucide-react";
import type { TransparencyCategory, TransparencyRecord } from "@/types/transparency";
import { TransparencyRecordItem } from "@/features/transparency/transparency-record";
import { CATEGORY_LABELS } from "@/features/transparency/category-labels";
import { EmptyState } from "@/components/shared/empty-state";
import { DataSourceBadge } from "@/components/shared/data-badges";
import { cn } from "@/lib/utils";
import type { DataSourceStatus } from "@/types/data";

export function TransparencyExplorer({
  records,
  limit,
  status = "ready",
}: {
  records: TransparencyRecord[];
  limit?: number;
  status?: DataSourceStatus;
}) {
  const [category, setCategory] = React.useState<TransparencyCategory | "all">("all");

  const filtered = records
    .filter((r) => category === "all" || r.category === category)
    .slice(0, limit);

  const categories: (TransparencyCategory | "all")[] = ["all", ...(Object.keys(CATEGORY_LABELS) as TransparencyCategory[])];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter by transparency category" className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              aria-pressed={category === cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                category === cat
                  ? "border-gt-emerald bg-gt-emerald/10 text-gt-emerald-bright"
                  : "border-gt-border text-gt-muted hover:text-gt-fg",
              )}
            >
              {cat === "all" ? "All" : CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
        {status === "ready" ? (
          <DataSourceBadge mode="live" source="Solana RPC + official project documents" />
        ) : (
          <span className="text-xs text-gt-muted">Official documents · on-chain verification unavailable</span>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileSearch}
          title={category === "security" ? "No security incidents have been published" : "No verified records in this category"}
          description={category === "security"
            ? "This means no incident report is currently published; it is not a claim that an incident is technically impossible."
            : "Records will appear here once an authoritative source is available."}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((record) => (
            <TransparencyRecordItem key={record.id} record={record} />
          ))}
        </ul>
      )}
    </div>
  );
}
