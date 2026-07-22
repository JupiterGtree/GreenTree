"use client";

import * as React from "react";
import { ChevronDown, Copy, ExternalLink, LogOut, Wallet as WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWallet } from "@/features/wallet/wallet-context";
import { shortenAddress, explorerAddressUrl } from "@/lib/constants/project";
import { ENV } from "@/lib/constants/env";
import { formatSol, formatToken } from "@/lib/formatters/number";
import { cn } from "@/lib/utils";

export function WalletButton({ className }: { className?: string }) {
  const { state, wallet, balanceStatus, openDialog, disconnect } = useWallet();
  const [menuOpen, setMenuOpen] = React.useState(false);

  if (state !== "connected" || !wallet) {
    return (
      <Button
        onClick={openDialog}
        size="sm"
        className={cn("h-9 px-4", className)}
        aria-label="Connect wallet"
      >
        <WalletIcon className="size-4" aria-hidden />
        <span className="hidden sm:inline">Connect Wallet</span>
        <span className="sm:hidden">Connect</span>
      </Button>
    );
  }

  return (
    <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
      <Button
        variant="secondary"
        size="sm"
        className={cn("h-9 px-3 font-mono", className)}
        onClick={() => setMenuOpen(true)}
        aria-haspopup="dialog"
      >
        <span className="size-2 rounded-full bg-gt-emerald-bright" aria-hidden />
        {shortenAddress(wallet.address, 4)}
        <ChevronDown className="size-3.5 text-gt-muted" aria-hidden />
      </Button>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Wallet</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-lg border border-gt-border bg-gt-surface px-4 py-3">
            <span className="font-mono text-sm text-gt-fg">{shortenAddress(wallet.address, 6)}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(wallet.address)}
                aria-label="Copy full address"
                className="rounded-md p-1.5 text-gt-muted hover:bg-gt-surface-2 hover:text-gt-emerald-bright"
              >
                <Copy className="size-4" aria-hidden />
              </button>
              <a
                href={explorerAddressUrl(ENV.solscanBaseUrl, wallet.address)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View wallet on explorer"
                className="rounded-md p-1.5 text-gt-muted hover:bg-gt-surface-2 hover:text-gt-emerald-bright"
              >
                <ExternalLink className="size-4" aria-hidden />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-gt-border bg-gt-surface px-4 py-3">
              <p className="text-xs text-gt-muted">SOL balance</p>
              <p className="tabular mt-1 text-lg font-semibold text-gt-fg">
                {balanceStatus === "ready" ? formatSol(wallet.solBalance) : balanceStatus === "loading" ? "Loading…" : "Unavailable"}
              </p>
            </div>
            <div className="rounded-lg border border-gt-border bg-gt-surface px-4 py-3">
              <p className="text-xs text-gt-muted">GTREE balance</p>
              <p className="tabular mt-1 text-lg font-semibold text-gt-fg">
                {balanceStatus === "ready" ? formatToken(wallet.gtreeBalance) : balanceStatus === "loading" ? "Loading…" : "Unavailable"}
              </p>
            </div>
          </div>

          <p className="text-xs text-gt-muted-2">
            Balances are read from Solana Mainnet after connection.
          </p>

          <Button
            variant="outline"
            onClick={() => {
              void disconnect();
              setMenuOpen(false);
            }}
            className="justify-center"
          >
            <LogOut className="size-4" aria-hidden />
            Disconnect
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
