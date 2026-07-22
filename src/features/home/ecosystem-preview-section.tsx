import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { FadeIn } from "@/components/shared/fade-in";
import { Button } from "@/components/ui/button";

const LOCATIONS = [
  { label: "Marketplace", position: "left-[12%] top-[61%]" },
  { label: "Digital Tree", position: "left-[32%] top-[37%]" },
  { label: "Green Score", position: "left-[55%] top-[24%]" },
  { label: "Governance", position: "left-[68%] top-[57%]" },
  { label: "Mission Hub", position: "left-[35%] top-[72%]" },
  { label: "TreeDrop", position: "left-[54%] top-[66%]" },
] as const;

export function EcosystemPreviewSection() {
  return (
    <section className="border-y border-gt-border-soft bg-gt-charcoal-2/45 py-20 sm:py-24 lg:py-28">
      <div className="container-gt">
        <FadeIn>
          <div className="mb-9 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading
              eyebrow="Ecosystem Preview"
              title="A world designed to connect."
              description="Six future modules form one connected Green Tree ecosystem. The artwork is a visual map of the concept, not a claim that these products are already live."
            />
            <Button variant="outline" asChild className="self-start lg:self-auto">
              <Link href="/ecosystem">
                Explore the ecosystem <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>

          <div className="relative h-[410px] overflow-hidden rounded-lg sm:h-auto sm:aspect-[1983/793]">
            <Image
              src="/Eco system.png"
              alt="Cinematic concept artwork representing the connected Green Tree ecosystem"
              fill
              sizes="(min-width: 1344px) 1344px, 100vw"
              className="object-cover object-center"
              quality={92}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gt-black/60 via-transparent to-gt-black/15" />
            <div className="absolute inset-0 hidden sm:block" aria-hidden>
              {LOCATIONS.map((location) => (
                <span
                  key={location.label}
                  className={`absolute ${location.position} -translate-x-1/2 -translate-y-1/2 rounded-md border border-white/15 bg-gt-black/60 px-2.5 py-1.5 text-[11px] font-semibold text-gt-offwhite shadow-sm backdrop-blur-md`}
                >
                  {location.label}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gt-muted sm:hidden" aria-label="Ecosystem locations">
            {LOCATIONS.map((location) => (
              <span key={location.label} className="inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-gt-emerald" aria-hidden />
                {location.label}
              </span>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
