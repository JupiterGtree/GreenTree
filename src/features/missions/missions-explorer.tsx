"use client";

import * as React from "react";
import { Search, Sprout } from "lucide-react";
import type { Mission, MissionCategory, MissionStatus } from "@/types/mission";
import { MissionCard } from "@/features/missions/mission-card";
import { CATEGORY_LABELS } from "@/features/missions/mission-category";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: { value: MissionStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "proposed", label: "Proposed" },
  { value: "under-review", label: "Under review" },
  { value: "approved", label: "Approved" },
  { value: "in-progress", label: "In progress" },
  { value: "partially-completed", label: "Partially completed" },
  { value: "completed", label: "Completed" },
  { value: "delayed", label: "Delayed" },
  { value: "suspended", label: "Suspended" },
  { value: "cancelled", label: "Cancelled" },
  { value: "failed", label: "Failed" },
];

const BUDGET_OPTIONS = [
  { value: "all", label: "Any budget" },
  { value: "under-10k", label: "Under $10,000" },
  { value: "10k-20k", label: "$10,000 \u2013 $20,000" },
  { value: "over-20k", label: "Over $20,000" },
] as const;

export function MissionsExplorer({ missions, enabled }: { missions: Mission[]; enabled: boolean }) {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<MissionStatus | "all">("all");
  const [category, setCategory] = React.useState<MissionCategory | "all">("all");
  const [verifiedOnly, setVerifiedOnly] = React.useState(false);
  const [budget, setBudget] = React.useState<typeof BUDGET_OPTIONS[number]["value"]>("all");

  const filtered = missions.filter((mission) => {
    if (status !== "all" && mission.status !== status) return false;
    if (category !== "all" && mission.category !== category) return false;
    if (verifiedOnly && !mission.verified) return false;
    if (budget === "under-10k" && mission.approvedBudgetUsd >= 10_000) return false;
    if (budget === "10k-20k" && (mission.approvedBudgetUsd < 10_000 || mission.approvedBudgetUsd > 20_000)) return false;
    if (budget === "over-20k" && mission.approvedBudgetUsd <= 20_000) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!mission.title.toLowerCase().includes(q) && !mission.location.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="glass-surface-b flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 sm:min-w-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gt-muted-2" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or location"
            aria-label="Search missions"
            disabled={!enabled}
            className="pl-9"
          />
        </div>

        <Select disabled={!enabled} value={status} onValueChange={(v) => setStatus(v as MissionStatus | "all")}>
          <SelectTrigger className="sm:w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select disabled={!enabled} value={category} onValueChange={(v) => setCategory(v as MissionCategory | "all")}>
          <SelectTrigger className="sm:w-48" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select disabled={!enabled} value={budget} onValueChange={(v) => setBudget(v as typeof budget)}>
          <SelectTrigger className="sm:w-40" aria-label="Filter by budget">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUDGET_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="button"
          disabled={!enabled}
          onClick={() => setVerifiedOnly((v) => !v)}
          aria-pressed={verifiedOnly}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
            verifiedOnly ? "border-gt-emerald bg-gt-emerald/10 text-gt-emerald-bright" : "border-gt-border text-gt-muted hover:text-gt-fg",
          )}
        >
          Verified evidence only
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Sprout}
          title="No missions match these filters"
          description="Try clearing a filter or searching a different location or keyword."
        />
      ) : (
        <div className="relative">
          <div
            className={cn(
              "grid gap-5 sm:grid-cols-2 lg:grid-cols-3",
              !enabled && "pointer-events-none select-none opacity-35 blur-[2px]",
            )}
            inert={!enabled}
            aria-hidden={!enabled}
          >
            {filtered.map((mission) => (
              <MissionCard key={mission.slug} mission={mission} enabled={enabled} />
            ))}
          </div>
          {!enabled && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border border-[#F59E0B]/45 bg-gt-charcoal/35 p-5 backdrop-blur-[1px]"
              role="status"
              aria-label="Environmental missions are locked during the Foundation phase"
            >
              <div className="max-w-xl text-center">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#F59E0B]">
                  FOUNDATION PHASE
                </p>
                <h2 className="mt-3 font-display text-2xl font-semibold text-[#F59E0B]">
                  Environmental missions are not active yet.
                </h2>
                <div className="mt-5 space-y-2 text-sm leading-6 text-gt-offwhite">
                  <p>Green Tree is currently operating in the Foundation phase.</p>
                  <p>Environmental missions will open only after funding, governance, local partnerships, permissions, and reporting standards are fully established.</p>
                  <p>Until then, the records below are shown only as examples of the future verification format and cannot be opened or interacted with.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
