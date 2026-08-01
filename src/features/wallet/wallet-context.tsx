"use client";

import * as React from "react";
import type { VersionedTransaction } from "@solana/web3.js";
import { useConnection, useWallet as useAdapterWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import type { ConnectedWallet, WalletConnectionState, WalletInfo } from "@/types/market";

export function getWalletOptions(detectProviders = true): WalletInfo[] {
  // The adapter context owns discovery. This helper remains for the existing dialog API.
  return detectProviders ? [
    { id: "Phantom", name: "Phantom", icon: "phantom", installed: false },
    { id: "Solflare", name: "Solflare", icon: "solflare", installed: false },
    { id: "Backpack", name: "Backpack", icon: "backpack", installed: false },
  ] : [];
}

interface WalletContextValue {
  state: WalletConnectionState;
  wallet: ConnectedWallet | null;
  balanceStatus: "idle" | "loading" | "ready" | "error";
  balanceError: string | null;
  isDialogOpen: boolean;
  error: string | null;
  openDialog: () => void;
  closeDialog: () => void;
  connect: (walletId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (transaction: VersionedTransaction) => Promise<VersionedTransaction>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  signAndSendTransaction: (transaction: VersionedTransaction) => Promise<string>;
  adapterName: string | null;
  publicKey: string | null;
  wallets: WalletInfo[];
}

const WalletContext = React.createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const adapter = useAdapterWallet();
  const { connection } = useConnection();
  const [wallet, setWallet] = React.useState<ConnectedWallet | null>(null);
  const [balanceStatus, setBalanceStatus] = React.useState<WalletContextValue["balanceStatus"]>("idle");
  const [balanceError, setBalanceError] = React.useState<string | null>(null);
  const [isDialogOpen, setDialogOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refreshBalance = React.useCallback(async (address: string) => {
    setBalanceStatus("loading"); setBalanceError(null);
    try {
      const response = await fetch(`/api/wallet/balance?address=${encodeURIComponent(address)}`, { cache: "no-store" });
      const balances = (await response.json()) as Partial<ConnectedWallet> & { error?: string };
      if (!response.ok || typeof balances.solBalanceLamports !== "string" || typeof balances.gtreeBalanceRaw !== "string") throw new Error(balances.error || "Wallet balances are temporarily unavailable.");
      setWallet({ address, solBalance: Number(balances.solBalance), solBalanceLamports: balances.solBalanceLamports, gtreeBalance: Number(balances.gtreeBalance), gtreeBalanceRaw: balances.gtreeBalanceRaw });
      setBalanceStatus("ready");
    } catch (e) { setBalanceStatus("error"); setBalanceError(e instanceof Error ? e.message : "Wallet balances are temporarily unavailable."); }
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (adapter.connected && adapter.publicKey) void refreshBalance(adapter.publicKey.toBase58());
      else { setWallet(null); setBalanceStatus("idle"); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [adapter.connected, adapter.publicKey, refreshBalance]);

  const connect = React.useCallback(async (walletId: string) => {
    setError(null);
    const selected = adapter.wallets.find((item) => item.adapter.name.toString() === walletId || item.adapter.name.toString().toLowerCase() === walletId.toLowerCase());
    if (!selected) { setError(`${walletId} is not installed or available in this browser.`); return; }
    try { await adapter.select(selected.adapter.name as WalletName); await adapter.connect(); setDialogOpen(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Wallet connection was rejected."); }
  }, [adapter]);

  const disconnect = React.useCallback(async () => { await adapter.disconnect(); setWallet(null); setBalanceStatus("idle"); setBalanceError(null); setError(null); }, [adapter]);
  const signTransaction = React.useCallback(async (transaction: VersionedTransaction) => {
    if (!adapter.connected || !adapter.signTransaction) throw new Error("Connect your wallet before signing the purchase.");
    return adapter.signTransaction(transaction);
  }, [adapter]);
  const signMessage = React.useCallback(async (message: Uint8Array) => {
    if (!adapter.connected || !adapter.signMessage) throw new Error("This wallet does not support message signing.");
    return adapter.signMessage(message);
  }, [adapter]);
  const signAndSendTransaction = React.useCallback(async (transaction: VersionedTransaction) => {
    if (!adapter.connected || !adapter.sendTransaction) throw new Error("Connect your wallet before submitting the transaction.");
    // The existing purchase flow uses signTransaction and backend submission. This method remains for compatibility.
    return adapter.sendTransaction(transaction, connection);
  }, [adapter, connection]);
  const state: WalletConnectionState = adapter.connecting ? "connecting" : adapter.connected ? "connected" : "disconnected";
  const wallets = adapter.wallets.map((item) => { const name = item.adapter.name.toString(); const lower = name.toLowerCase(); return { id: name, name, icon: lower.includes("phantom") ? "phantom" : lower.includes("solflare") ? "solflare" : lower.includes("backpack") ? "backpack" : "generic", installed: item.readyState === "Installed" } as WalletInfo; });
  const value = React.useMemo(() => ({ state, wallet, balanceStatus, balanceError, isDialogOpen, error, wallets, openDialog: () => { setError(null); setDialogOpen(true); }, closeDialog: () => setDialogOpen(false), connect, disconnect, signTransaction, signMessage, signAndSendTransaction, adapterName: adapter.wallet?.adapter.name.toString() ?? null, publicKey: adapter.publicKey?.toBase58() ?? null }), [state, wallet, balanceStatus, balanceError, isDialogOpen, error, wallets, connect, disconnect, signTransaction, signMessage, signAndSendTransaction, adapter.wallet, adapter.publicKey]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() { const context = React.useContext(WalletContext); if (!context) throw new Error("useWallet must be used within WalletProvider"); return context; }
