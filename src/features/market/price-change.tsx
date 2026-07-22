import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatPct } from "@/lib/formatters/number";
import { cn } from "@/lib/utils";

export function PriceChange({ value, className }: { value: number; className?: string }) {
  const isUp = value > 0;
  const isFlat = value === 0;
  const Icon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-1 text-sm font-semibold",
        isFlat ? "text-gt-muted" : isUp ? "text-gt-emerald-bright" : "text-gt-danger",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {formatPct(value)}
      <span className="sr-only">{isFlat ? "no change" : isUp ? "increase" : "decrease"}</span>
    </span>
  );
}
