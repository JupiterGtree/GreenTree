import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/shared/fade-in";
import { TreeRingsBackground } from "@/components/decorative/tree-rings";

export function ClosingStatementSection() {
  return (
    <section className="relative overflow-hidden border-t border-gt-border bg-gt-forest-deep">
      <TreeRingsBackground className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] opacity-40" />
      <div className="container-gt relative py-16 text-center sm:py-20">
        <FadeIn className="mx-auto flex max-w-2xl flex-col items-center gap-5">
          <p className="font-display text-balance text-2xl italic leading-snug text-gt-leaf sm:text-3xl">
            &ldquo;A tree alone cannot become a forest. A token alone cannot become an ecosystem.
            Communities create lasting value.&rdquo;
          </p>
          <p className="text-sm uppercase tracking-[0.2em] text-gt-muted">Grow Together.</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/market">Buy GTREE</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/missions">See the missions</Link>
            </Button>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
