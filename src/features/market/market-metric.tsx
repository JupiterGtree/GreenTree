import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface MarketMetricProps {
  label: string;
  value?: React.ReactNode;
  helper?: React.ReactNode;
  icon?: LucideIcon;
  state?: "loading" | "ready" | "unavailable";
  className?: string;
}

export function MarketMetric({ label, value, helper, icon: Icon, state = "ready", className }: MarketMetricProps) {
  return (
    <div className={cn("glass-surface-b flex flex-col gap-1.5 rounded-md px-4 py-3.5", className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-gt-muted">
        {Icon && <Icon className="size-3.5" aria-hidden />}
        {label}
      </div>
      {state === "loading" ? (
        <Skeleton className="h-6 w-24" />
      ) : state === "unavailable" ? (
        <span className="text-sm text-gt-muted-2">Unavailable</span>
      ) : (
        <div className="tabular text-lg font-semibold text-gt-offwhite sm:text-xl">{value}</div>
      )}
      {helper && <div className="text-xs text-gt-muted-2">{helper}</div>}
    </div>
  );
}
