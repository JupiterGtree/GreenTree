import type { AuthorityFact } from "@/types/market";
import { AuthorityStatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

export function AuthorityStatusList({ authorities, className }: { authorities: AuthorityFact[]; className?: string }) {
  return (
    <ul className={cn("grid auto-rows-fr grid-cols-1 gap-3", className)}>
      {authorities.map((fact) => (
        <li key={fact.id} className="glass-surface-b flex min-h-24 flex-col justify-between gap-4 rounded-lg px-4 py-3.5">
          <div>
            <p className="text-sm font-semibold text-gt-fg">{fact.label}</p>
            <p className="mt-1 text-sm leading-relaxed text-gt-muted">{fact.explanation}</p>
          </div>
          <AuthorityStatusBadge status={fact.status} className="w-fit max-w-full" />
        </li>
      ))}
    </ul>
  );
}
