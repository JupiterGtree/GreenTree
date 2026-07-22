import Link from "next/link";
import { Suspense } from "react";
import { SectionHeading } from "@/components/shared/section-heading";
import { BuyWidget } from "@/features/market/buy-widget";
import { PriceChart } from "@/features/market/price-chart";
import { FadeIn } from "@/components/shared/fade-in";
import { getSiteContent } from "@/lib/admin/site-content";
import { MarketSnapshot } from "@/features/market/market-snapshot";
import { MarketSnapshotSkeleton } from "@/features/market/market-snapshot-skeleton";
import { FoundationActivityCard } from "@/features/home/foundation-activity-card";

export function BuyAndChartSection() {
  const { marketWarning } = getSiteContent();
  return (
    <section className="border-t border-gt-border bg-gt-charcoal-2/60 py-12 sm:py-14">
      <div className="container-gt">
        <FadeIn>
          <SectionHeading
            eyebrow="Market Access"
            title="Live market access, without the clutter."
            description="Verified pool data and a real Jupiter swap route, arranged in one compact market workspace."
            className="mb-6"
          />
        </FadeIn>
        <Suspense fallback={<MarketSnapshotSkeleton />}>
          <MarketSnapshot compact className="mb-6" />
        </Suspense>
        <div className="grid min-w-0 items-stretch gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <FadeIn className="order-2 min-w-0 lg:order-1 lg:h-full">
            <div className="glass-surface-b min-w-0 overflow-hidden rounded-lg p-5 sm:p-6 lg:h-full">
              <BuyWidget riskNotice={marketWarning} />
            </div>
          </FadeIn>
          <FadeIn delay={0.08} className="relative order-1 min-w-0 lg:order-2 lg:h-full">
            <div className="surface-card min-w-0 overflow-hidden rounded-lg p-5 sm:p-6">
              <PriceChart />
            </div>
            <div className="mt-3 min-w-0 lg:absolute lg:inset-x-0 lg:bottom-0 lg:mt-0">
              <FoundationActivityCard />
            </div>
          </FadeIn>
        </div>
        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-gt-muted-2">
          {marketWarning} Read the full{" "}
          <Link href="/docs#token-market-policy" className="text-gt-emerald-bright hover:underline">
            Token and Market Policy
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
