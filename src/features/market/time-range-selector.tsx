"use client";

import type { ChartRange } from "@/types/market";
import { cn } from "@/lib/utils";

const RANGES: ChartRange[] = ["1H", "24H", "7D", "30D"];

export function TimeRangeSelector({
  value,
  onChange,
  className,
}: {
  value: ChartRange;
  onChange: (range: ChartRange) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Select chart time range"
      className={cn("inline-flex items-center gap-1 rounded-lg border border-gt-border bg-gt-surface p-1", className)}
    >
      {RANGES.map((range) => (
        <button
          key={range}
          type="button"
          aria-pressed={value === range}
          onClick={() => onChange(range)}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
            value === range ? "bg-gt-emerald text-gt-black" : "text-gt-muted hover:text-gt-fg",
          )}
        >
          {range}
        </button>
      ))}
    </div>
  );
}
