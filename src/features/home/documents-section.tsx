import Link from "next/link";
import { SectionHeading } from "@/components/shared/section-heading";
import { OFFICIAL_DOCUMENTS } from "@/lib/constants/documents";
import { DocumentCard } from "@/features/docs/document-card";
import { FadeIn } from "@/components/shared/fade-in";
import { Button } from "@/components/ui/button";

export function DocumentsSection() {
  const featured = OFFICIAL_DOCUMENTS.slice(0, 3);

  return (
    <section className="border-t border-gt-border bg-gt-charcoal-2/60 py-14 sm:py-16">
      <div className="container-gt">
        <FadeIn>
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <SectionHeading
              eyebrow="Official Documents"
              title="Read the source material."
              description="The Version 2.0.0 document pack is the single source of truth for Green Tree."
            />
            <Button variant="outline" asChild>
              <Link href="/docs">All documents</Link>
            </Button>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((doc) => (
              <DocumentCard key={doc.slug} document={doc} />
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
