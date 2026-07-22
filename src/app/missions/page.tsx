import type { Metadata } from "next";
import { SectionHeading } from "@/components/shared/section-heading";
import { PageCover } from "@/components/shared/page-cover-background";
import { MissionsExplorer } from "@/features/missions/missions-explorer";
import { DEMO_MISSIONS } from "@/lib/data/mock-missions";
import { Badge } from "@/components/ui/badge";
import { getSiteContent } from "@/lib/admin/site-content";

export const metadata: Metadata = {
  title: "Missions",
  description: "The Green Tree environmental mission directory, with status, verification and budget information.",
};

export default function MissionsPage() {
  const missionsEnabled = getSiteContent().environmentalMissionsEnabled;
  return (
    <div className="pb-20">
      <PageCover src="/Missions.png" objectPosition="center 55%">
          <SectionHeading
            eyebrow="Environmental Missions"
            title="Verified environmental work, not just announcements."
            description="Green Tree intends to organize more than ten substantial environmental missions per year, subject to feasibility, funding, permissions, local partners, execution capability and public verification."
          />
          <Badge variant="gold" className="mt-5">
            Example mission records · demonstrating the verification format
          </Badge>
      </PageCover>

      <section className="container-gt py-10 sm:py-14">
        <MissionsExplorer missions={DEMO_MISSIONS} enabled={missionsEnabled} />
      </section>
    </div>
  );
}
