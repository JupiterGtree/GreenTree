import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { ROADMAP_PHASES, ROADMAP_STATUS_LABEL, type RoadmapStatus } from "@/lib/constants/roadmap";
import { FadeIn } from "@/components/shared/fade-in";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_TEXT: Record<RoadmapStatus, string> = {
  completed: "text-gt-emerald-bright",
  active: "text-gt-gold-bright",
  next: "text-gt-info",
  planned: "text-gt-muted-2",
  research: "text-gt-muted-2",
};

const STATUS_MARKER: Record<RoadmapStatus, string> = {
  completed: "border-gt-emerald bg-gt-emerald text-gt-black",
  active: "border-gt-gold-bright bg-gt-charcoal text-gt-gold-bright ring-4 ring-gt-gold/10",
  next: "border-gt-info bg-gt-charcoal text-gt-info",
  planned: "border-gt-border bg-gt-charcoal text-gt-muted-2",
  research: "border-gt-border bg-gt-charcoal text-gt-muted-2",
};

export function RoadmapPreviewSection() {
  return (
    <section className="bg-gt-charcoal py-20 sm:py-24 lg:py-28">
      <div className="container-gt">
        <FadeIn>
          <div className="mb-12 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading
              eyebrow="Roadmap Preview"
              title="Progress has a direction."
              description="The roadmap uses published phases and states rather than invented deadlines. The active phase is emphasized; later work remains deliberately quieter."
            />
            <Button variant="outline" asChild className="self-start lg:self-auto">
              <Link href="/roadmap">
                View the full roadmap <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>

          {/* Desktop: Five-column timeline with continuous track */}
          <div className="hidden lg:block">
            <div className="relative">
              {/* Continuous connector line - spans full width through node centers */}
              <div className="absolute inset-x-0 top-5 flex items-center" aria-hidden>
                <div className="h-px w-full bg-gt-border" />
              </div>
              
              {/* Five phase columns */}
              <ol className="relative grid" style={{ gridTemplateColumns: "repeat(5, 1fr)" }} aria-label="Green Tree roadmap phases">
                {ROADMAP_PHASES.map((phase) => (
                  <li key={phase.id} className="flex flex-col items-center" aria-current={phase.status === "active" ? "step" : undefined}>
                    {/* Node centered on the track line */}
                    <div className="relative z-10">
                      <span
                        className={cn(
                          "flex size-10 items-center justify-center rounded-full border text-xs font-semibold",
                          STATUS_MARKER[phase.status],
                        )}
                        aria-hidden
                      >
                        {phase.status === "completed" ? <Check className="size-4" /> : phase.phase.replace("Phase ", "")}
                      </span>
                    </div>
                    
                    {/* Phase content */}
                    <div className="mt-5 text-center px-2">
                      <p className={cn("text-[11px] font-semibold uppercase tracking-[0.16em]", STATUS_TEXT[phase.status])}>
                        {phase.phase} · {ROADMAP_STATUS_LABEL[phase.status]}
                      </p>
                      <h3 className={cn("mt-2 text-base font-semibold leading-snug", phase.status === "active" ? "text-gt-offwhite" : "text-gt-fg")}>
                        {phase.title}
                      </h3>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Mobile: Vertical timeline */}
          <ol className="relative flex flex-col lg:hidden" aria-label="Green Tree roadmap phases">
            {ROADMAP_PHASES.map((phase, index) => (
              <li
                key={phase.id}
                className="relative grid grid-cols-[2.5rem_1fr] gap-4 pb-8 last:pb-0"
                aria-current={phase.status === "active" ? "step" : undefined}
              >
                {index < ROADMAP_PHASES.length - 1 && (
                  <span className="absolute bottom-0 left-5 top-10 w-px bg-gt-border" aria-hidden />
                )}
                <span
                  className={cn(
                    "relative z-10 flex size-10 items-center justify-center rounded-full border text-xs font-semibold",
                    STATUS_MARKER[phase.status],
                  )}
                  aria-hidden
                >
                  {phase.status === "completed" ? <Check className="size-4" /> : phase.phase.replace("Phase ", "")}
                </span>
                <div className="pt-0.5">
                  <p className={cn("text-[11px] font-semibold uppercase tracking-[0.16em]", STATUS_TEXT[phase.status])}>
                    {phase.phase} · {ROADMAP_STATUS_LABEL[phase.status]}
                  </p>
                  <h3 className="mt-1.5 text-base font-semibold leading-snug text-gt-offwhite">{phase.title}</h3>
                </div>
              </li>
            ))}
          </ol>
        </FadeIn>
      </div>
    </section>
  );
}
