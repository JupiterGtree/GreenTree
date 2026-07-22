"use client";

import * as React from "react";
import { SectionHeading } from "@/components/shared/section-heading";
import { EcosystemModule } from "@/features/ecosystem/ecosystem-module";
import { EcosystemNetwork } from "@/features/ecosystem/ecosystem-network";
import { ECOSYSTEM_MODULES, LIFECYCLE_LABEL } from "@/lib/constants/ecosystem";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function EcosystemPageClient() {
  const [activeId, setActiveId] = React.useState<string | null>(null);

  return (
    <>
      <section className="container-gt py-10 sm:py-14">
        <SectionHeading
          eyebrow="Living Network"
          title="An organic map of the ecosystem"
          description="Hover a node to see how it connects back to the wallet and GTREE at the center."
          className="mb-8"
        />
        <div className="surface-card rounded-lg p-6 sm:p-10">
          <EcosystemNetwork activeId={activeId} onHover={setActiveId} />
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {ECOSYSTEM_MODULES.map((module) => (
              <button
                key={module.id}
                type="button"
                onMouseEnter={() => setActiveId(module.id)}
                onMouseLeave={() => setActiveId(null)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  activeId === module.id ? "border-gt-emerald bg-gt-emerald/10 text-gt-emerald-bright" : "border-gt-border text-gt-muted",
                )}
              >
                {module.title}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="container-gt py-10 sm:py-14">
        <SectionHeading eyebrow="Modules" title="Ecosystem modules" className="mb-8" />
        <div className="mb-6 flex flex-wrap gap-2">
          {(Object.keys(LIFECYCLE_LABEL) as (keyof typeof LIFECYCLE_LABEL)[]).map((key) => (
            <Badge key={key} variant={key === "concept" ? "neutral" : key === "planned" ? "info" : "gold"}>
              {LIFECYCLE_LABEL[key]}
            </Badge>
          ))}
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ECOSYSTEM_MODULES.map((module) => (
            <EcosystemModule
              key={module.id}
              module={module}
              className={cn("transition-all", activeId === module.id && "border-gt-emerald/50 bg-gt-surface-2")}
            />
          ))}
        </div>
      </section>
    </>
  );
}
