"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { WalletProvider } from "@/features/wallet/wallet-context";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={150}>
      <WalletProvider>{children}</WalletProvider>
    </TooltipProvider>
  );
}
