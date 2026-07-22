import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ROADMAP_STATUS_LABEL, type RoadmapPhaseData, type RoadmapStatus } from "@/lib/constants/roadmap";
import { cn } from "@/lib/utils";

const STATUS_VARIANT: Record<RoadmapStatus, "emerald" | "gold" | "info" | "neutral"> = {
  completed: "emerald",
  active: "gold",
  next: "info",
  planned: "neutral",
  research: "neutral",
};

export function RoadmapPhase({
  phase,
  compact = false,
  className,
}: {
  phase: RoadmapPhaseData;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("glass-surface-b flex flex-col gap-3 rounded-lg p-5", compact && "p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gt-muted">{phase.phase}</span>
        <Badge variant={STATUS_VARIANT[phase.status]}>{ROADMAP_STATUS_LABEL[phase.status]}</Badge>
      </div>
      <h3 className="font-display text-lg font-semibold text-gt-offwhite">{phase.title}</h3>
      {!compact && <p className="text-sm leading-relaxed text-gt-muted">{phase.summary}</p>}
      <ul className="flex flex-col gap-1.5">
        {phase.items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-gt-muted">
            <Check className={cn("mt-0.5 size-3.5 shrink-0", phase.status === "completed" ? "text-gt-emerald-bright" : "text-gt-muted-2")} aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
