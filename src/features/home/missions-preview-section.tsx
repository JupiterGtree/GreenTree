import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CircleDashed } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { FadeIn } from "@/components/shared/fade-in";
import { Button } from "@/components/ui/button";

export function MissionsPreviewSection() {
  return (
    <section className="overflow-hidden bg-gt-black py-20 sm:py-24 lg:py-28">
      <div className="container-gt">
        <FadeIn className="grid overflow-hidden rounded-lg bg-gt-charcoal-2 lg:grid-cols-[1.14fr_0.86fr]">
          <div className="relative min-h-[340px] sm:min-h-[430px] lg:min-h-[540px]">
            <Image
              src="/Missions.png"
              alt=""
              fill
              sizes="(min-width: 1024px) 58vw, 100vw"
              className="object-cover object-center"
              quality={92}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-gt-charcoal-2/75 lg:block" />
            <div className="absolute inset-0 bg-gradient-to-t from-gt-black/65 via-transparent to-gt-black/10" />
            <div className="absolute bottom-5 left-5 flex items-center gap-2 rounded-md border border-white/10 bg-gt-black/55 px-3 py-2 text-xs text-gt-fg backdrop-blur-md sm:bottom-7 sm:left-7">
              <CircleDashed className="size-3.5 text-gt-warning" aria-hidden />
              Publication pipeline ready
            </div>
          </div>

          <div className="flex flex-col justify-center px-6 py-10 sm:px-10 sm:py-12 lg:-ml-px lg:px-12">
            <SectionHeading
              eyebrow="Environmental Missions"
              title="Evidence before celebration."
              description="Each Green Tree mission is expected to publish its scope, executor, budget, evidence, milestones and final outcome before it can be presented as verified work."
            />

            <div className="mt-8 border-l-2 border-gt-warning/70 pl-4">
              <p className="text-sm font-semibold text-gt-offwhite">Current verified state</p>
              <p className="mt-1 text-sm leading-relaxed text-gt-muted">
                No verified environmental missions have been published yet.
              </p>
            </div>

            <Button variant="outline" asChild className="mt-8 self-start">
              <Link href="/missions">
                Explore the mission framework <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
