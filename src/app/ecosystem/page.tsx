import type { Metadata } from "next";
import { SectionHeading } from "@/components/shared/section-heading";
import { PageCover } from "@/components/shared/page-cover-background";
import { EcosystemPageClient } from "@/features/ecosystem/ecosystem-page-client";

export const metadata: Metadata = {
  title: "Ecosystem",
  description: "Digital Tree, Green Score, TreeDrop, mission participation, governance and marketplace \u2014 future Green Tree ecosystem modules.",
};

export default function EcosystemPage() {
  return (
    <div className="pb-20">
      <PageCover src="/Eco system.png">
          <SectionHeading
            eyebrow="Ecosystem"
            title="What grows around GTREE."
            description="Future products that connect community identity, participation and verified environmental work. None of these modules are active on Mainnet — each is clearly labeled by its current lifecycle state."
          />
      </PageCover>

      <EcosystemPageClient />
    </div>
  );
}
