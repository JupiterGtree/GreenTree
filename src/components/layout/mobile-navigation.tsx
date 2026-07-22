"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletButton } from "@/features/wallet/wallet-button";
import { TokenAddress } from "@/components/shared/token-address";
import { NAV_LINKS } from "@/lib/constants/project";
import { ENV } from "@/lib/constants/env";
import { cn } from "@/lib/utils";

export function MobileNavigation() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
      >
        <Menu className="size-5" aria-hidden />
      </Button>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity duration-200 data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <DialogPrimitive.Content
          className={cn(
            "fixed right-0 top-0 z-50 flex h-full w-[min(88vw,22rem)] flex-col border-l border-gt-border bg-gt-charcoal-2 p-6 shadow-xl",
            "transition-transform duration-300 ease-out data-[state=closed]:translate-x-full data-[state=open]:translate-x-0",
          )}
        >
          <VisuallyHidden>
            <DialogPrimitive.Title>Site navigation</DialogPrimitive.Title>
          </VisuallyHidden>
          <div className="flex items-center justify-between">
            <span className="font-display text-base font-semibold text-gt-offwhite">Menu</span>
            <DialogPrimitive.Close
              className="rounded-md p-1.5 text-gt-muted transition-colors hover:bg-gt-surface-2 hover:text-gt-fg focus-visible:outline-2 focus-visible:outline-gt-emerald-bright"
              aria-label="Close navigation menu"
            >
              <X className="size-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <nav aria-label="Mobile primary" className="mt-8 flex flex-col gap-1">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "rounded-md px-3 py-3 text-base font-medium transition-colors",
                    active
                      ? "bg-gt-surface-2 text-gt-emerald-bright"
                      : "text-gt-fg hover:bg-gt-surface-2",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-4 border-t border-gt-border pt-5">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-gt-muted">GTREE mint</span>
              <TokenAddress address={ENV.gtreeMint} chars={4} />
            </div>
            <WalletButton className="w-full justify-center" />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
