import { FlaskConical, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DataMode } from "@/types/market";

export function DemoDataBadge({ className }: { className?: string }) {
  return (
    <Badge variant="gold" className={cn("uppercase tracking-wide", className)}>
      <FlaskConical className="size-3" aria-hidden />
      Demo data
    </Badge>
  );
}

export function LiveDataBadge({ className }: { className?: string }) {
  return (
    <Badge variant="emerald" className={cn("uppercase tracking-wide", className)}>
      <Radio className="size-3" aria-hidden />
      Live
    </Badge>
  );
}

export function DataSourceBadge({ mode, source }: { mode: DataMode; source?: string }) {
  if (mode === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gt-muted">
        <LiveDataBadge />
        {source && <span>{source}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gt-muted">
      <DemoDataBadge />
      {source && <span>{source}</span>}
    </span>
  );
}
