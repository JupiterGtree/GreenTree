"use client";

import * as React from "react";
import { AllocationChart } from "@/features/token/allocation-chart";
import { AllocationLegend } from "@/features/token/allocation-legend";

export function AllocationSection() {
  const [activeId, setActiveId] = React.useState<string | null>(null);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
      <AllocationChart activeId={activeId} />
      <AllocationLegend activeId={activeId} onHover={setActiveId} />
    </div>
  );
}
