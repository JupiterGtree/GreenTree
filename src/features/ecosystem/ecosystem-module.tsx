import { Badge } from "@/components/ui/badge";
import { LIFECYCLE_LABEL, type EcosystemModuleData } from "@/lib/constants/ecosystem";
import { cn } from "@/lib/utils";

const LIFECYCLE_VARIANT = {
  concept: "neutral",
  planned: "info",
  "in-development": "gold",
} as const;

export function EcosystemModule({ module, className }: { module: EcosystemModuleData; className?: string }) {
  const Icon = module.icon;
  return (
    <article className={cn("glass-surface-b flex flex-col gap-4 rounded-lg p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-11 items-center justify-center rounded-lg bg-gt-surface-3 text-gt-emerald-bright">
          <Icon className="size-5" aria-hidden />
        </span>
        <Badge variant={LIFECYCLE_VARIANT[module.lifecycle]}>{LIFECYCLE_LABEL[module.lifecycle]}</Badge>
      </div>
      <h3 className="font-display text-xl font-semibold text-gt-offwhite">{module.title}</h3>
      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-gt-muted">Purpose</dt>
          <dd className="mt-1 leading-relaxed text-gt-muted">{module.purpose}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-gt-muted">User value</dt>
          <dd className="mt-1 leading-relaxed text-gt-muted">{module.userValue}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-gt-muted">Connection to GTREE</dt>
          <dd className="mt-1 leading-relaxed text-gt-muted">{module.connection}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-gt-muted">Connects to</dt>
          <dd className="mt-1 leading-relaxed text-gt-muted">{module.moduleLinks}</dd>
        </div>
      </dl>
    </article>
  );
}
