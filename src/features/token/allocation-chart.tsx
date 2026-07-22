"use client";

import * as React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ALLOCATION, PROJECT } from "@/lib/constants/project";
import { formatNumber } from "@/lib/formatters/number";

const COLORS = [
  "var(--gt-emerald-bright)",
  "var(--gt-emerald)",
  "var(--gt-leaf)",
  "var(--gt-moss)",
  "var(--gt-gold-bright)",
  "var(--gt-gold)",
  "#5f8fae",
  "#7a6fae",
  "#3f6b52",
];

const data = ALLOCATION.map((item) => ({
  ...item,
  amount: Math.round((item.pct / 100) * PROJECT.maxSupply),
}));

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: (typeof data)[number] }[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-md border border-gt-border bg-gt-charcoal-2 px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-gt-offwhite">{item.label}</p>
      <p className="tabular mt-0.5 text-gt-muted">{item.pct}% \u00b7 {formatNumber(item.amount, { compact: true })} GTREE</p>
    </div>
  );
}

export function AllocationChart({ activeId }: { activeId?: string | null }) {
  return (
    <div className="relative h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="pct"
            nameKey="label"
            innerRadius="62%"
            outerRadius="100%"
            paddingAngle={2}
            stroke="var(--gt-charcoal)"
            strokeWidth={2}
            isAnimationActive
            animationDuration={600}
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.id}
                fill={COLORS[index % COLORS.length]}
                opacity={activeId && activeId !== entry.id ? 0.35 : 1}
              />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-gt-muted">Max supply</span>
        <span className="tabular text-xl font-semibold text-gt-offwhite">1B GTREE</span>
      </div>
    </div>
  );
}

export { data as allocationData, COLORS as allocationColors };
