import { Suspense } from "react";
import type { Metadata } from "next";
import { SectionHeading } from "@/components/shared/section-heading";
import { PageCover } from "@/components/shared/page-cover-background";
import { MarketSnapshot } from "@/features/market/market-snapshot";
import { MarketSnapshotSkeleton } from "@/features/market/market-snapshot-skeleton";
import { PriceChart } from "@/features/market/price-chart";
import { BuyWidget } from "@/features/market/buy-widget";
import { TransactionsExplorer } from "@/features/transactions/transactions-explorer";
import { LiquidityMilestones } from "@/features/liquidity/liquidity-milestones";
import { FoundationActivityCard } from "@/features/home/foundation-activity-card";
import { FoundationSaleProgress } from "@/features/market/foundation-sale-progress";
import { getSiteContent } from "@/lib/admin/site-content";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Market",
  description: "GTREE market overview, live price chart and a public-market acquisition interface.",
};

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  const { marketWarning } = getSiteContent();
  return (
    <div className="pb-20">
      <PageCover src="/Market.png">
          <SectionHeading
            eyebrow="Market"
            title="GTREE market overview"
            description="A single interface to the public Solana market for GTREE — no private website price, no presale mechanics."
          />
      </PageCover>

      <section className="container-gt py-10 sm:py-12">
        <Suspense fallback={<MarketSnapshotSkeleton />}>
          <MarketSnapshot />
        </Suspense>
      </section>

      <section className="container-gt py-4">
        <div className="grid min-w-0 items-stretch gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="flex min-w-0 flex-col lg:h-full">
            <div className="surface-card min-w-0 overflow-hidden rounded-lg p-5 sm:p-6">
              <PriceChart />
            </div>
            <div className="mt-6 min-w-0 flex-1">
              <FoundationSaleProgress fill />
            </div>
          </div>
          <div className="glass-surface-b h-full min-w-0 overflow-hidden rounded-lg p-5 sm:p-6">
            <BuyWidget riskNotice={marketWarning} />
          </div>
        </div>
        <div className="mt-6 min-w-0">
          <FoundationActivityCard limit={15} expanded />
        </div>
        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-gt-muted-2">{marketWarning}</p>
      </section>

      <section className="container-gt py-10 sm:py-14">
        <SectionHeading
          eyebrow="Liquidity"
          title="Liquidity milestones"
          description="Cumulative thresholds that guide when and how much liquidity Green Tree contributes."
          className="mb-8"
        />
        <Suspense fallback={<Skeleton className="h-72 w-full rounded-lg" />}>
          <LiquidityMilestones />
        </Suspense>
      </section>

      <section className="container-gt py-10 sm:py-14">
        <SectionHeading
          eyebrow="Activity"
          title="Latest transactions"
          description="Confirmed Solana activity involving the Foundation treasury and sale inventory accounts."
          className="mb-8"
        />
        <TransactionsExplorer />
      </section>
    </div>
  );
}
