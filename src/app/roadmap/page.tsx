import type { Metadata } from "next";
import { SectionHeading } from "@/components/shared/section-heading";
import { PageCover } from "@/components/shared/page-cover-background";
import { RoadmapTimeline } from "@/features/roadmap/roadmap-timeline";
import { ROADMAP_STATUS_LABEL } from "@/lib/constants/roadmap";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Roadmap",
  description: "The full Green Tree roadmap, phase by phase, with honest status labels instead of invented dates.",
};

const STATUS_VARIANT = {
  completed: "emerald",
  active: "gold",
  next: "info",
  planned: "neutral",
  research: "neutral",
} as const;

export default function RoadmapPage() {
  return (
    <div className="pb-20">
      <PageCover src="/Roadmap.png?v=20260718-2">
          <SectionHeading
            eyebrow="Roadmap"
            title="A straight path, phase by phase."
            description="Status labels reflect real progress. Where dates are not documented, Green Tree uses phases and states rather than invented deadlines."
          />
          <div className="mt-5 flex flex-wrap gap-2">
            {(Object.keys(ROADMAP_STATUS_LABEL) as (keyof typeof ROADMAP_STATUS_LABEL)[]).map((key) => (
              <Badge key={key} variant={STATUS_VARIANT[key]}>
                {ROADMAP_STATUS_LABEL[key]}
              </Badge>
            ))}
          </div>
      </PageCover>

      <section className="container-gt py-10 sm:py-14">
        <RoadmapTimeline />
      </section>
    </div>
  );
}
