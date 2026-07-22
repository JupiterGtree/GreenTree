import { ROADMAP_PHASES } from "@/lib/constants/roadmap";
import { RoadmapPhase } from "@/features/roadmap/roadmap-phase";
import { cn } from "@/lib/utils";

const STATUS_DOT = {
  completed: "bg-gt-emerald-bright",
  active: "bg-gt-gold-bright",
  next: "bg-gt-info",
  planned: "bg-gt-muted-2",
  research: "bg-gt-muted-2",
} as const;

export function RoadmapTimeline({ compact = false }: { compact?: boolean }) {
  const phases = compact ? ROADMAP_PHASES.slice(0, 3) : ROADMAP_PHASES;

  return (
    <div
      className="flex flex-col gap-6 lg:grid lg:gap-4"
      style={{ gridTemplateColumns: `repeat(${phases.length}, minmax(0, 1fr))` } as React.CSSProperties}
    >
      {phases.map((phase, index) => (
        <div key={phase.id} className="relative flex gap-4 lg:flex-col lg:gap-3">
          <div className="flex flex-col items-center lg:hidden">
            <span className={cn("size-2.5 shrink-0 rounded-full", STATUS_DOT[phase.status])} aria-hidden />
            {index < phases.length - 1 && <span className="mt-1 w-px flex-1 bg-gt-border" aria-hidden />}
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <span className={cn("size-2.5 shrink-0 rounded-full", STATUS_DOT[phase.status])} aria-hidden />
            <span className={cn("h-px flex-1", index < phases.length - 1 ? "bg-gt-border" : "bg-transparent")} aria-hidden />
          </div>
          <RoadmapPhase phase={phase} compact={compact} className="flex-1" />
        </div>
      ))}
    </div>
  );
}
