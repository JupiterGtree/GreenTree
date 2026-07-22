import Link from "next/link";
import { Compass, Home, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TreeRingsBackground } from "@/components/decorative/tree-rings";

export default function NotFound() {
  return (
    <div className="relative flex min-h-[70vh] items-center justify-center overflow-hidden">
      <TreeRingsBackground className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 opacity-50" />
      <div className="container-gt relative flex flex-col items-center gap-5 py-20 text-center">
        <span className="flex size-16 items-center justify-center rounded-full border border-gt-border bg-gt-surface text-gt-emerald-bright">
          <Compass className="size-7" aria-hidden />
        </span>
        <p className="font-display text-6xl font-semibold text-gt-offwhite">404</p>
        <h1 className="font-display text-2xl font-semibold text-gt-offwhite">This path hasn&apos;t grown yet.</h1>
        <p className="max-w-md text-sm leading-relaxed text-gt-muted">
          The page you were looking for doesn&apos;t exist, may have moved, or the link may contain a
          typo. Try one of these instead.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link href="/">
              <Home className="size-4" aria-hidden />
              Back to homepage
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/market">
              <Search className="size-4" aria-hidden />
              Explore the market
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
