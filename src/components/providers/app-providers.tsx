"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { WalletProvider } from "@/features/wallet/wallet-context";
import { ConnectionProvider, WalletProvider as AdapterWalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter, SolflareWalletAdapter, LedgerWalletAdapter } from "@solana/wallet-adapter-wallets";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={150}>
      <ConnectionProvider endpoint={process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"}>
        <AdapterWalletProvider wallets={[new PhantomWalletAdapter(), new SolflareWalletAdapter(), new BackpackWalletAdapter(), new LedgerWalletAdapter()]} autoConnect={false}>
          <WalletProvider>{children}</WalletProvider>
        </AdapterWalletProvider>
      </ConnectionProvider>
    </TooltipProvider>
  );
}
