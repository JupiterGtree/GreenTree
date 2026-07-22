import { Suspense } from "react";
import { SectionHeading } from "@/components/shared/section-heading";
import { LiquidityMilestones } from "@/features/liquidity/liquidity-milestones";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/shared/fade-in";

export function LiquiditySection() {
  return (
    <section className="border-t border-gt-border bg-gt-charcoal-2/60 py-14 sm:py-16">
      <div className="container-gt">
        <FadeIn>
          <SectionHeading
            eyebrow="Liquidity Milestones"
            title="Liquidity that deepens as proceeds grow."
            description="Three cumulative thresholds, not additive percentages. Each ring represents progress toward its own cumulative target."
            className="mb-8"
          />
          <Suspense fallback={<Skeleton className="h-72 w-full rounded-lg" />}>
            <LiquidityMilestones />
          </Suspense>
        </FadeIn>
      </div>
    </section>
  );
}
