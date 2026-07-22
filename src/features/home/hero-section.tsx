import Image from "next/image";
import Link from "next/link";
import { ArrowRight, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/shared/copy-button";
import { ENV } from "@/lib/constants/env";
import { explorerAddressUrl, shortenAddress } from "@/lib/constants/project";
import { getSiteContent } from "@/lib/admin/site-content";

export function HeroSection() {
  const { hero } = getSiteContent();
  return (
    <section className="relative flex min-h-[740px] w-full items-end overflow-hidden border-b border-gt-border/70 sm:min-h-[700px] md:min-h-[720px] md:items-center lg:min-h-[780px] 2xl:min-h-[860px]">
      <Image
        src="/hero.png"
        alt="A sunlit green landscape with the Green Tree character overlooking the valley"
        fill
        priority
        quality={92}
        sizes="100vw"
        className="object-cover object-[67%_center] sm:object-[64%_center] md:object-[70%_center] lg:object-[right_center]"
      />

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(3,20,14,0.82)_0%,rgba(4,28,19,0.56)_34%,rgba(7,35,24,0.10)_67%,rgba(6,28,20,0.02)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[rgba(3,15,11,0.56)] to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[rgba(5,48,31,0.06)] mix-blend-multiply" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-52 bg-gradient-to-b from-transparent via-[rgba(11,21,18,0.46)] to-gt-charcoal" />

      <div className="container-gt relative z-10 flex w-full pb-10 pt-28 sm:pb-14 md:py-24 lg:py-28">
        <div className="flex w-full max-w-[590px] flex-col gap-5 md:gap-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gt-emerald-bright sm:text-xs">
            Green Tree <span className="px-1 text-gt-muted">·</span> Solana Mainnet
          </p>

          <h1 className="max-w-[570px] font-display text-[2.35rem] font-semibold leading-[1.08] tracking-[-0.035em] text-gt-offwhite [text-shadow:0_3px_24px_rgba(0,0,0,0.48)] sm:text-[2.8rem] md:text-[3.2rem] lg:text-[3.65rem]">
            {hero.title}
          </h1>

          <p className="max-w-[560px] text-[15px] leading-7 text-[#d4ded7] sm:text-base md:text-lg md:leading-8">
            {hero.subtitle}
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button size="lg" asChild className="w-full sm:w-auto">
              <Link href="/market">Buy GTREE <ArrowRight aria-hidden /></Link>
            </Button>
            <Button size="lg" variant="secondary" asChild className="w-full bg-black/18 sm:w-auto">
              <Link href="/transparency">Explore Transparency</Link>
            </Button>
            <Button size="lg" variant="ghost" asChild className="w-full sm:w-auto">
              <Link href="/docs"><FileText aria-hidden /> View Documents</Link>
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-xs text-[#becdc3]">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-gt-emerald-bright" aria-hidden />
              Mainnet active
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-gt-fg">
              {shortenAddress(ENV.gtreeMint, 4)}
              <CopyButton value={ENV.gtreeMint} iconOnly label="Copy mint address" />
            </span>
            <a
              href={explorerAddressUrl(ENV.solscanBaseUrl, ENV.gtreeMint)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-gt-offwhite"
            >
              <Search className="size-3.5" aria-hidden />
              Explorer
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
