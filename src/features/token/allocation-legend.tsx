"use client";

import * as React from "react";
import { allocationColors, allocationData } from "@/features/token/allocation-chart";
import { formatNumber } from "@/lib/formatters/number";
import { cn } from "@/lib/utils";

export function AllocationLegend({
  activeId,
  onHover,
}: {
  activeId?: string | null;
  onHover?: (id: string | null) => void;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {allocationData.map((item, index) => (
        <li key={item.id}>
          <button
            type="button"
            onMouseEnter={() => onHover?.(item.id)}
            onMouseLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(item.id)}
            onBlur={() => onHover?.(null)}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
              activeId === item.id ? "bg-gt-surface-2" : "hover:bg-gt-surface-2/60",
            )}
          >
            <span className="flex items-center gap-2.5">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: allocationColors[index % allocationColors.length] }}
                aria-hidden
              />
              <span className="text-sm text-gt-fg">{item.label}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="tabular text-xs text-gt-muted-2">{formatNumber(item.amount, { compact: true })}</span>
              <span className="tabular w-12 text-right text-sm font-semibold text-gt-offwhite">{item.pct}%</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
