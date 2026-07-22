import { Suspense } from "react";
import type { Metadata } from "next";
import { SectionHeading } from "@/components/shared/section-heading";
import { TokenStatePanel } from "@/features/token/token-state-panel";
import { AllocationSection } from "@/features/token/allocation-section";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TokenAddress } from "@/components/shared/token-address";
import { PROJECT } from "@/lib/constants/project";
import { ENV } from "@/lib/constants/env";
import { formatNumber } from "@/lib/formatters/number";

export const metadata: Metadata = {
  title: "Token",
  description: "GTREE token identity, supply, allocation and authority information on Solana Mainnet.",
};

export default function TokenPage() {
  return (
    <div className="pb-20">
      <section className="border-b border-gt-border bg-gt-charcoal-2/60">
        <div className="container-gt py-12 sm:py-14">
          <SectionHeading
            eyebrow="Token"
            title={`${PROJECT.name} (${PROJECT.token})`}
            description="A Classic SPL Token on Solana Mainnet with a fixed maximum supply and no launch-time transfer restrictions."
          />
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Badge variant="emerald">{PROJECT.network}</Badge>
            <Badge variant="neutral">{PROJECT.tokenStandard}</Badge>
            <Badge variant="neutral">{PROJECT.decimals} decimals</Badge>
            <Badge variant="gold">{formatNumber(PROJECT.maxSupply, { compact: true })} max supply</Badge>
            <TokenAddress address={ENV.gtreeMint} chars={6} />
          </div>
        </div>
      </section>

      <section className="container-gt py-10 sm:py-14">
        <SectionHeading eyebrow="Token State" title="Authorities and control" className="mb-8" />
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
          <TokenStatePanel />
        </Suspense>
      </section>

      <section className="container-gt py-10 sm:py-14">
        <SectionHeading
          eyebrow="Allocation"
          title="Supply allocation"
          description="Public accounting categories across the fixed maximum supply of 1,000,000,000 GTREE. These labels do not impose token-level vesting or lock rules."
          className="mb-8"
        />
        <div className="surface-card rounded-lg p-5 sm:p-6">
          <AllocationSection />
        </div>
      </section>
    </div>
  );
}
