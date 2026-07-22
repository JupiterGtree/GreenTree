"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/shared/logo";
import { TokenAddress } from "@/components/shared/token-address";
import { WalletButton } from "@/features/wallet/wallet-button";
import { WalletDialog } from "@/features/wallet/wallet-dialog";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { NAV_LINKS } from "@/lib/constants/project";
import { ENV } from "@/lib/constants/env";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const [scrolled, setScrolled] = React.useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        className={cn(
          "top-0 z-40 w-full transition-all duration-300",
          isHome ? "fixed" : "sticky",
          scrolled
            ? "border-b border-gt-border/80 bg-gt-charcoal/92 backdrop-blur-md shadow-[0_1px_0_0_rgba(0,0,0,0.3)]"
            : "border-b border-white/10 bg-[rgba(3,22,16,0.18)] backdrop-blur-sm",
        )}
      >
        <div className="container-gt flex h-16 items-center justify-between gap-4">
          <Logo />

          <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                    active ? "text-gt-emerald-bright" : "text-gt-muted hover:text-gt-fg",
                  )}
                >
                  {link.label}
                  {active && (
                    <span className="absolute inset-x-3 -bottom-[1px] h-[2px] rounded-full bg-gt-emerald-bright" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <TokenAddress
              address={ENV.gtreeMint}
              className="hidden xl:inline-flex"
              chars={4}
            />
            <div className="hidden sm:block">
              <WalletButton />
            </div>
            <MobileNavigation />
          </div>
        </div>
      </header>
      <WalletDialog />
    </>
  );
}
