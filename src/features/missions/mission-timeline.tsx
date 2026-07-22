import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import type { MissionMilestone } from "@/types/mission";
import { formatDate, formatUsd } from "@/lib/formatters/number";
import { explorerTxUrl } from "@/lib/constants/project";
import { ENV } from "@/lib/constants/env";
import { cn } from "@/lib/utils";

export function MissionTimeline({ milestones }: { milestones: MissionMilestone[] }) {
  return (
    <ol className="flex flex-col gap-0">
      {milestones.map((milestone, index) => {
        const isPaid = milestone.status === "paid";
        return (
          <li key={milestone.id} className="relative flex gap-4 pb-6 last:pb-0">
            {index < milestones.length - 1 && (
              <span className="absolute left-[11px] top-6 h-full w-px bg-gt-border" aria-hidden />
            )}
            <span className={cn("z-10 flex size-6 shrink-0 items-center justify-center rounded-full border", isPaid ? "border-gt-emerald-bright bg-gt-emerald/20 text-gt-emerald-bright" : "border-gt-border bg-gt-surface text-gt-muted-2")}>
              {isPaid ? <CheckCircle2 className="size-4" aria-hidden /> : <Circle className="size-3" aria-hidden />}
            </span>
            <div className="flex-1 pt-0.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gt-fg">{milestone.label}</p>
                <span className="tabular text-sm font-medium text-gt-muted">{formatUsd(milestone.amountUsd, { compact: true })}</span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-gt-muted-2">
                <span className={cn(isPaid ? "text-gt-emerald-bright" : "text-gt-muted-2")}>
                  {milestone.status === "paid" ? "Paid" : milestone.status === "skipped" ? "Skipped" : "Pending"}
                </span>
                {milestone.date && <span>{formatDate(milestone.date)}</span>}
                {milestone.signature && (
                  <a
                    href={explorerTxUrl(ENV.solscanBaseUrl, milestone.signature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-gt-emerald-bright hover:underline"
                  >
                    Transaction <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
