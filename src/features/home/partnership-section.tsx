import { Handshake } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { FadeIn } from "@/components/shared/fade-in";
import { PROJECT } from "@/lib/constants/project";
import { PartnershipForm } from "./partnership-form";

const PARTNER_CATEGORIES = [
  "Community & marketing",
  "Technology",
  "Environmental",
  "Media & research",
  "Exchange collaboration",
] as const;

export function PartnershipSection() {
  return (
    <section className="relative overflow-hidden border-y border-gt-border-soft bg-[#101c20] py-14 sm:py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_45%,rgba(125,184,201,0.10),transparent_38%),radial-gradient(circle_at_88%_30%,rgba(32,178,170,0.08),transparent_34%)]" />
      <div className="container-gt relative">
        <FadeIn className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-12">
          <div className="lg:pt-2">
            <div className="flex items-start gap-5">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-md border border-gt-info/25 bg-gt-info/10 text-gt-info">
                <Handshake className="size-5" aria-hidden />
              </span>
              <SectionHeading eyebrow="Partnerships" title="Build with Green Tree." />
            </div>
            <p className="max-w-xl text-base leading-7 text-gt-muted">
              Share a concise proposal for a community, technology, environmental, media, exchange, or research collaboration.
            </p>

            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-y border-gt-border-soft py-3 text-xs text-gt-muted">
              {PARTNER_CATEGORIES.map((category) => (
                <span key={category} className="inline-flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-gt-info" aria-hidden />
                  {category}
                </span>
              ))}
            </div>

            <p className="mt-5 text-sm leading-6 text-gt-muted">
              Your details are used only to review this request and contact you about it. Verify Green Tree through our official X account{" "}
              <a href={PROJECT.officialX} target="_blank" rel="noreferrer" className="text-gt-emerald-bright hover:underline">
                {PROJECT.officialXHandle}
              </a>.
            </p>
          </div>
          <PartnershipForm />
        </FadeIn>
      </div>
    </section>
  );
}
