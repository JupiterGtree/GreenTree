import type { Metadata } from "next";
import { SectionHeading } from "@/components/shared/section-heading";
import { PageCover } from "@/components/shared/page-cover-background";
import { TransparencySummary } from "@/features/transparency/transparency-summary";
import { TransparencyExplorer } from "@/features/transparency/transparency-explorer";
import { TreasuryControl } from "@/features/treasury/treasury-control";
import { AllocationSection } from "@/features/token/allocation-section";
import { LiquidityPolicyCard } from "@/features/liquidity/liquidity-policy-card";
import { PROJECT } from "@/lib/constants/project";
import { getTransparencyRecords } from "@/data/transparency/get-transparency-records";

export const metadata: Metadata = {
  title: "Transparency Center",
  description: "Token authorities, treasury control, liquidity reporting, mission budgets and material policy changes for Green Tree.",
};

export default async function TransparencyPage() {
  const result = await getTransparencyRecords();
  const records = result.data ?? [];
  return (
    <div className="pb-20">
      <PageCover src="/Transparency Center.png">
          <SectionHeading
            eyebrow="Transparency Center"
            title="Accountability that can be checked."
            description={`Green Tree publishes material information about token authorities, treasury-controlled addresses, liquidity contributions, mission budgets and policy changes. This center distinguishes policy, on-chain record, and project report for every entry. Document pack version ${PROJECT.docVersion}.`}
          />
      </PageCover>

      <section className="container-gt py-10 sm:py-12">
        <TransparencySummary records={records} />
      </section>

      <section className="container-gt py-6 sm:py-8">
        <SectionHeading eyebrow="Treasury and Multisig" title="Shared treasury control" className="mb-6" />
        <div className="surface-card rounded-lg p-5 sm:p-6">
          <TreasuryControl />
        </div>
      </section>

      <section className="container-gt py-10 sm:py-12">
        <SectionHeading
          eyebrow="Token Allocation"
          title="Public accounting categories"
          description="These are public accounting categories, not vesting schedules. Project-controlled balances are governed through the official treasury-control structure."
          className="mb-6"
        />
        <div className="surface-card rounded-lg p-5 sm:p-6">
          <AllocationSection />
        </div>
      </section>

      <section className="container-gt py-10 sm:py-12">
        <SectionHeading eyebrow="Liquidity" title="Liquidity policy" className="mb-6" />
        <LiquidityPolicyCard />
      </section>

      <section className="container-gt py-10 sm:py-14">
        <SectionHeading
          eyebrow="Records"
          title="All transparency records"
          description="Filter by category to review policy statements, on-chain records and project reports."
          className="mb-8"
        />
        <TransparencyExplorer records={records} status={result.status} />
      </section>
    </div>
  );
}
