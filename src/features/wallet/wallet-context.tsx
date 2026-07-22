"use client";

import * as React from "react";
import type { VersionedTransaction } from "@solana/web3.js";
import type { ConnectedWallet, WalletConnectionState, WalletInfo } from "@/types/market";

interface InjectedSolanaProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: { toString(): string };
  connect(): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  signTransaction?(transaction: VersionedTransaction): Promise<VersionedTransaction>;
  signAndSendTransaction(transaction: VersionedTransaction): Promise<{ signature: string } | string>;
}

declare global {
  interface Window {
    phantom?: { solana?: InjectedSolanaProvider };
    solflare?: InjectedSolanaProvider;
  }
}

/**
 * Keep provider discovery opt-in.  An injected wallet can be present before
 * React hydrates, while it is necessarily absent during SSR.  Calling this
 * with the default value therefore keeps the server and first client tree
 * identical; the dialog enables discovery only after mount.
 */
export function getWalletOptions(detectProviders = false): WalletInfo[] {
  const browser = detectProviders && typeof window !== "undefined";
  return [
    { id: "phantom", name: "Phantom", icon: "phantom", installed: browser && Boolean(window.phantom?.solana?.isPhantom) },
    { id: "solflare", name: "Solflare", icon: "solflare", installed: browser && Boolean(window.solflare?.isSolflare) },
  ];
}

function providerFor(walletId: string): InjectedSolanaProvider | null {
  if (typeof window === "undefined") return null;
  if (walletId === "phantom") return window.phantom?.solana ?? null;
  if (walletId === "solflare") return window.solflare ?? null;
  return null;
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
  signAndSendTransaction: (transaction: VersionedTransaction) => Promise<string>;
}

const WalletContext = React.createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<WalletConnectionState>("disconnected");
  const [wallet, setWallet] = React.useState<ConnectedWallet | null>(null);
  const [balanceStatus, setBalanceStatus] = React.useState<WalletContextValue["balanceStatus"]>("idle");
  const [balanceError, setBalanceError] = React.useState<string | null>(null);
  const [isDialogOpen, setDialogOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const providerRef = React.useRef<InjectedSolanaProvider | null>(null);

  const connect = React.useCallback(async (walletId: string) => {
    const provider = providerFor(walletId);
    if (!provider) {
      setError(`${walletId === "phantom" ? "Phantom" : "Solflare"} is not installed in this browser.`);
      return;
    }
    setError(null);
    setState("connecting");
    try {
      const result = await provider.connect();
      const address = result.publicKey.toString();
      providerRef.current = provider;
      setWallet({ address, solBalance: 0, solBalanceLamports: "0", gtreeBalance: 0, gtreeBalanceRaw: "0" });
      setBalanceStatus("loading");
      setBalanceError(null);
      setState("connected");
      setDialogOpen(false);

      const response = await fetch(`/api/wallet/balance?address=${encodeURIComponent(address)}`, { cache: "no-store" });
      const balances = (await response.json()) as Partial<ConnectedWallet> & { error?: string };
      if (!response.ok || typeof balances.solBalanceLamports !== "string" || typeof balances.gtreeBalanceRaw !== "string") {
        throw new Error(balances.error || "Wallet balances are temporarily unavailable.");
      }
      setWallet({
        address,
        solBalance: Number(balances.solBalance),
        solBalanceLamports: balances.solBalanceLamports,
        gtreeBalance: Number(balances.gtreeBalance),
        gtreeBalanceRaw: balances.gtreeBalanceRaw,
      });
      setBalanceStatus("ready");
    } catch (connectionError) {
      if (providerRef.current) {
        setBalanceStatus("error");
        setBalanceError(connectionError instanceof Error ? connectionError.message : "Wallet balances are temporarily unavailable.");
      } else {
        setState("rejected");
        setError(connectionError instanceof Error ? connectionError.message : "Wallet connection was rejected.");
      }
    }
  }, []);

  const disconnect = React.useCallback(async () => {
    try {
      await providerRef.current?.disconnect();
    } finally {
      providerRef.current = null;
      setState("disconnected");
      setWallet(null);
      setBalanceStatus("idle");
      setBalanceError(null);
      setError(null);
    }
  }, []);

  const signAndSendTransaction = React.useCallback(async (transaction: VersionedTransaction) => {
    if (!providerRef.current) throw new Error("Connect your wallet before submitting the swap.");
    const result = await providerRef.current.signAndSendTransaction(transaction);
    return typeof result === "string" ? result : result.signature;
  }, []);

  const signTransaction = React.useCallback(async (transaction: VersionedTransaction) => {
    if (!providerRef.current) throw new Error("Connect your wallet before signing the purchase.");
    if (!providerRef.current.signTransaction) {
      throw new Error("This wallet does not support signing the Foundation purchase transaction.");
    }
    return providerRef.current.signTransaction(transaction);
  }, []);

  const value = React.useMemo<WalletContextValue>(() => ({
    state,
    wallet,
    balanceStatus,
    balanceError,
    isDialogOpen,
    error,
    openDialog: () => { setError(null); setDialogOpen(true); },
    closeDialog: () => setDialogOpen(false),
    connect,
    disconnect,
    signTransaction,
    signAndSendTransaction,
  }), [state, wallet, balanceStatus, balanceError, isDialogOpen, error, connect, disconnect, signTransaction, signAndSendTransaction]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = React.useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within WalletProvider");
  return context;
}
