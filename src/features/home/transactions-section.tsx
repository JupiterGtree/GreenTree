import { SectionHeading } from "@/components/shared/section-heading";
import { TransactionsExplorer } from "@/features/transactions/transactions-explorer";
import { FadeIn } from "@/components/shared/fade-in";

export async function TransactionsSection() {
  return (
    <section className="container-gt py-14 sm:py-16">
      <FadeIn>
        <SectionHeading
          eyebrow="Latest Transactions"
          title="Recent verified Solana activity."
          description="Confirmed Foundation treasury and sale-inventory activity with explorer references."
          className="mb-8"
        />
        <TransactionsExplorer limit={6} />
      </FadeIn>
    </section>
  );
}
