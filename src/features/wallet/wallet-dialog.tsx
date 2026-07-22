"use client";

import { Loader2, ShieldCheck, Wallet as WalletIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getWalletOptions, useWallet } from "@/features/wallet/wallet-context";
import { cn } from "@/lib/utils";

export function WalletDialog() {
  const { isDialogOpen, closeDialog, connect, state, error } = useWallet();
  const isBusy = state === "connecting";
  const wallets = getWalletOptions();

  return (
    <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent aria-describedby="wallet-dialog-description">
        <DialogHeader>
          <DialogTitle>Connect a wallet</DialogTitle>
          <DialogDescription id="wallet-dialog-description">
            Connect an installed Solana wallet. Green Tree never receives your private key.
          </DialogDescription>
        </DialogHeader>

        {isBusy ? (
          <div className="glass-surface-b flex flex-col items-center gap-3 rounded-lg px-6 py-10 text-center">
            <Loader2 className="size-6 animate-spin text-gt-emerald-bright" aria-hidden />
            <p className="text-sm font-medium text-gt-fg">
              Waiting for your wallet…
            </p>
            <p className="text-xs text-gt-muted">
              Approve the connection request in your wallet extension.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {wallets.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => void connect(w.id)}
                className={cn(
                  "glass-surface-b flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:border-gt-emerald/50 hover:bg-gt-surface-2/85 focus-visible:outline-2 focus-visible:outline-gt-emerald-bright",
                )}
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-gt-surface-3 text-gt-emerald-bright">
                  <WalletIcon className="size-4" aria-hidden />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-gt-fg">{w.name}</span>
                  <span className="block text-xs text-gt-muted">
                    {w.installed ? "Installed" : "Extension not detected"}
                  </span>
                </span>
                <ShieldCheck className="size-4 text-gt-muted" aria-hidden />
              </button>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-md border border-gt-danger/30 bg-gt-danger/5 px-3 py-2 text-xs text-gt-danger">
            {error}
          </p>
        )}

        <p className="mt-5 text-xs leading-relaxed text-gt-muted-2">
          Green Tree never asks for a seed phrase or private key. Only connect wallets through their
          official browser extension or app.
        </p>
      </DialogContent>
    </Dialog>
  );
}
