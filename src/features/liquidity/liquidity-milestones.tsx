import { CheckCircle2, Circle } from "lucide-react";
import { LiquidityRings } from "@/features/liquidity/liquidity-rings";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/formatters/number";
import { cn } from "@/lib/utils";
import { LIQUIDITY_THRESHOLDS } from "@/lib/constants/project";

const RING_COLORS = ["var(--gt-leaf)", "var(--gt-emerald)", "var(--gt-gold-bright)"];

export async function LiquidityMilestones() {
  const cumulativeProceedsUsd: number | null = null;
  const thresholds = LIQUIDITY_THRESHOLDS;

  const rings = thresholds.map((t, i) => ({
    id: `ring-${t.proceedsUsd}`,
    radius: 46 + i * 34,
    progressPct: cumulativeProceedsUsd === null ? 0 : (cumulativeProceedsUsd / t.proceedsUsd) * 100,
    color: RING_COLORS[i % RING_COLORS.length],
    achieved: cumulativeProceedsUsd !== null && cumulativeProceedsUsd >= t.proceedsUsd,
  }));

  const nextThreshold = cumulativeProceedsUsd === null
    ? thresholds[0]
    : thresholds.find((t) => cumulativeProceedsUsd < t.proceedsUsd) ?? thresholds[thresholds.length - 1];

  return (
    <div className="grid gap-8 lg:grid-cols-[auto_1fr] lg:items-center">
      <div className="flex flex-col items-center gap-3">
        <LiquidityRings rings={[...rings].reverse()} />
        <Badge variant="outline">Policy thresholds</Badge>
      </div>

      <div className="flex flex-col gap-5">
        <div className="glass-surface-b rounded-lg px-4 py-3">
          <p className="text-xs text-gt-muted">Verified cumulative proceeds</p>
          <p className="mt-1 text-lg font-semibold text-gt-offwhite">Not available from the public pool feed</p>
          <p className="mt-1 text-xs text-gt-muted-2">
            Next threshold: {formatUsd(nextThreshold.proceedsUsd, { compact: true })} → up to{" "}
            {nextThreshold.targetCumulativePct}% cumulative liquidity
          </p>
        </div>

        <ol className="flex flex-col gap-3">
          {thresholds.map((t, i) => {
            const achieved = cumulativeProceedsUsd !== null && cumulativeProceedsUsd >= t.proceedsUsd;
            return (
              <li
                key={t.proceedsUsd}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border px-4 py-3",
                  achieved ? "border-gt-emerald/35 bg-gt-emerald/8" : "border-gt-border bg-gt-surface/70 backdrop-blur-sm",
                )}
              >
                <div className="flex items-center gap-3">
                  {achieved ? (
                    <CheckCircle2 className="size-4 text-gt-emerald-bright" aria-hidden />
                  ) : (
                    <Circle className="size-4 text-gt-muted-2" aria-hidden />
                  )}
                  <span className="text-sm text-gt-fg">
                    At {formatUsd(t.proceedsUsd, { compact: true })} cumulative proceeds
                  </span>
                </div>
                <span
                  className="tabular rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ backgroundColor: `color-mix(in srgb, ${RING_COLORS[i]} 18%, transparent)`, color: RING_COLORS[i] }}
                >
                  up to {t.targetCumulativePct}% cumulative
                </span>
              </li>
            );
          })}
        </ol>

        <p className="text-xs leading-relaxed text-gt-muted-2">
          These percentages are cumulative targets, not additive — reaching the USD 200,000
          threshold targets up to 32% cumulative liquidity contribution in total, not 18% + 22% + 32%.
          Liquidity actions do not guarantee a price floor, buyback, or permanent liquidity value.
        </p>
      </div>
    </div>
  );
}
