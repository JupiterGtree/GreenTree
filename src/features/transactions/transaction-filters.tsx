"use client";

import { cn } from "@/lib/utils";
import type { OnchainActivityType } from "@/types/transaction";

export type TransactionFilter = "all" | "direct-buys" | "transfers" | "treasury";

const FILTERS: { id: TransactionFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "direct-buys", label: "Direct buys" },
  { id: "transfers", label: "Transfers" },
  { id: "treasury", label: "Treasury" },
];

export function TransactionFilters({
  value,
  onChange,
}: {
  value: TransactionFilter;
  onChange: (filter: TransactionFilter) => void;
}) {
  return (
    <div role="group" aria-label="Filter transactions" className="flex flex-wrap gap-1.5">
      {FILTERS.map((filter) => (
        <button
          key={filter.id}
          type="button"
          aria-pressed={value === filter.id}
          onClick={() => onChange(filter.id)}
          className={cn(
            "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
            value === filter.id
              ? "border-gt-emerald bg-gt-emerald/10 text-gt-emerald-bright"
              : "border-gt-border text-gt-muted hover:text-gt-fg",
          )}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

export function matchesFilter(type: OnchainActivityType, filter: TransactionFilter): boolean {
  if (filter === "all") return true;
  if (filter === "direct-buys") return type === "FOUNDATION_DIRECT_BUY";
  if (filter === "transfers") return type === "GTREE_TRANSFER";
  if (filter === "treasury") return type === "TREASURY_ACTIVITY";
  return true;
}
