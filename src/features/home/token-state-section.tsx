import { Suspense } from "react";
import Link from "next/link";
import { SectionHeading } from "@/components/shared/section-heading";
import { TokenStatePanel } from "@/features/token/token-state-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/shared/fade-in";
import { Button } from "@/components/ui/button";

export function TokenStateSection() {
  return (
    <section className="container-gt py-14 sm:py-16">
      <FadeIn>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            eyebrow="Token State"
            title="What GTREE is, in plain terms."
          />
          <Button variant="outline" asChild>
            <Link href="/token">Full token page</Link>
          </Button>
        </div>
        <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
          <TokenStatePanel />
        </Suspense>
      </FadeIn>
    </section>
  );
}
