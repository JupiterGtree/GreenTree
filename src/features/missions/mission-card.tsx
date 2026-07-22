import Link from "next/link";
import { BadgeCheck, Camera, MapPin } from "lucide-react";
import type { Mission } from "@/types/mission";
import { MissionStatusBadge } from "@/components/shared/status-badge";
import { CATEGORY_LABELS } from "@/features/missions/mission-category";
import { formatUsd } from "@/lib/formatters/number";

export function MissionCard({ mission, enabled = true }: { mission: Mission; enabled?: boolean }) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-gt-emerald-bright">
            {CATEGORY_LABELS[mission.category]}
          </span>
          <h3 className="mt-1 font-display text-lg font-semibold text-gt-offwhite group-hover:text-gt-emerald-bright">
            {mission.title}
          </h3>
        </div>
        <MissionStatusBadge status={mission.status} />
      </div>

      <p className="flex items-center gap-1.5 text-xs text-gt-muted">
        <MapPin className="size-3.5" aria-hidden />
        {mission.location}
      </p>

      <p className="text-sm leading-relaxed text-gt-muted line-clamp-2">{mission.objective}</p>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-gt-muted">
          <span>Completion</span>
          <span className="tabular font-semibold text-gt-fg">{mission.completionPct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gt-surface-3">
          <div
            className="h-full rounded-full bg-gt-emerald-bright transition-all"
            style={{ width: `${mission.completionPct}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-gt-border-soft pt-3 text-xs text-gt-muted">
        <span>
          Budget <span className="tabular font-semibold text-gt-fg">{formatUsd(mission.approvedBudgetUsd, { compact: true })}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Camera className="size-3.5" aria-hidden />
          {mission.evidenceCount} evidence items
        </span>
        {mission.verified && (
          <span className="inline-flex items-center gap-1 text-gt-emerald-bright">
            <BadgeCheck className="size-3.5" aria-hidden />
            Verified
          </span>
        )}
      </div>

      {mission.isExample && (
        <span className="text-[11px] font-medium uppercase tracking-wide text-gt-gold-bright">
          Example mission record
        </span>
      )}
    </>
  );

  const className = "glass-surface-b group flex flex-col gap-4 rounded-lg p-5 transition-colors hover:border-gt-emerald/45 hover:bg-gt-surface-2/85 focus-visible:outline-2 focus-visible:outline-gt-emerald-bright";
  if (!enabled) {
    return <div className={className} aria-disabled="true">{content}</div>;
  }
  return <Link href={`/missions/${mission.slug}`} className={className}>{content}</Link>;
}
