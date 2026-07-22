import type { Metadata } from "next";
import { SectionHeading } from "@/components/shared/section-heading";
import { PageCover } from "@/components/shared/page-cover-background";
import { DocumentsExplorer } from "@/features/docs/documents-explorer";
import { PROJECT } from "@/lib/constants/project";

export const metadata: Metadata = {
  title: "Documents",
  description: "The official Green Tree Version 2.0.0 document library: whitepaper, constitution, manifest and policies.",
};

export default function DocsPage() {
  return (
    <div className="pb-20">
      <PageCover src="/Docs.png" objectPosition="center 65%">
          <SectionHeading
            eyebrow="Docs"
            title="Official document library"
            description={`Version ${PROJECT.docVersion} of the Green Tree document pack is the single source of truth for project facts, policy and reporting standards.`}
          />
      </PageCover>

      <section className="container-gt py-10 sm:py-14">
        <DocumentsExplorer />
      </section>
    </div>
  );
}
