"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/features/wallet/wallet-context";
import { decimalToAtomic, atomicToDecimal } from "@/lib/market/amounts";

type Snapshot = { gtreeUsd: number; priceSol: number; solUsd: number; sourceStatus: string; fetchedAt: string };
type Inventory = { spendableGtree: string; status: string };
type TelegramWebApp = { initData?: string; close?: () => void; ready?: () => void };

function telegramWebApp(): TelegramWebApp | undefined {
  return (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

export function TelegramMiniApp() {
  const { publicKey, adapterName, state: walletState, openDialog, signMessage } = useWallet();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [sol, setSol] = useState("");
  const [notice, setNotice] = useState("");
  const [initData] = useState(() => typeof window === "undefined" ? "" : telegramWebApp()?.initData ?? "");
  const [sessionId, setSessionId] = useState("");
  const [verifiedWallet, setVerifiedWallet] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    void Promise.all([
      fetch("/api/market/snapshot", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/foundation/inventory", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([market, foundation]) => { setSnapshot(market.data ?? null); setInventory(foundation.data ?? foundation); });
    const app = telegramWebApp();
    const rawInitData = initData;
    app?.ready?.();
    if (rawInitData) void fetch("/api/telegram/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ initData: rawInitData }) }).then(async (response) => { const data = await response.json() as { sessionId?: string; expiresAt?: number; error?: string }; if (!response.ok || !data.sessionId) throw new Error(data.error ?? "Telegram session unavailable."); setSessionId(data.sessionId); }).catch((error) => setNotice(error instanceof Error ? error.message : "Telegram session unavailable."));
  }, [initData]);

  const estimate = useMemo(() => { if (!snapshot || !sol) return null; try { const lamports = BigInt(decimalToAtomic(sol, 9).raw); return (lamports * BigInt(Math.floor((1 / snapshot.priceSol) * 1e9))) / 1_000_000_000n; } catch { return null; } }, [sol, snapshot]);

  async function verifyWallet() {
    setNotice("");
    if (!publicKey) return setNotice("Connect Phantom, Solflare, or Backpack first.");
    if (!initData || !sessionId) return setNotice("Open this secure page from Telegram to connect your wallet.");
    setVerifying(true);
    try {
      const challengeResponse = await fetch("/api/telegram/wallet/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ initData, sessionId, walletAddress: publicKey }) });
      const challenge = await challengeResponse.json() as { challengeId?: string; message?: string; error?: string };
      if (!challengeResponse.ok || !challenge.challengeId || !challenge.message) throw new Error(challenge.error ?? "Could not create wallet challenge.");
      const signed = await signMessage(new TextEncoder().encode(challenge.message));
      const signature = btoa(String.fromCharCode(...signed));
      const verificationResponse = await fetch("/api/telegram/wallet/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ initData, sessionId, challengeId: challenge.challengeId, walletAddress: publicKey, signature }) });
      const verification = await verificationResponse.json() as { verified?: boolean; walletAddress?: string; error?: string };
      if (!verificationResponse.ok || !verification.verified) throw new Error(verification.error ?? "Wallet verification failed.");
      setVerifiedWallet(verification.walletAddress ?? publicKey);
      setNotice("Wallet verified successfully.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Wallet verification failed."); }
    finally { setVerifying(false); }
  }

  function returnToTelegram() { telegramWebApp()?.close?.(); }

  return <main className="min-h-dvh bg-gt-black p-4 text-gt-fg"><section className="mx-auto max-w-md space-y-4"><p className="text-xs font-semibold uppercase tracking-[.16em] text-gt-emerald-bright">Green Tree · Telegram</p><h1 className="text-2xl font-semibold">Buy GTREE</h1><div className="glass-surface-b rounded-lg p-4"><p className="text-xs text-gt-muted">GTREE/USD</p><p className="mt-1 text-xl font-semibold">{snapshot ? `$${snapshot.gtreeUsd}` : "Unavailable"}</p><p className="mt-2 text-sm text-gt-muted">GTREE/SOL {snapshot?.priceSol ?? "—"} · SOL/USD ${snapshot?.solUsd ?? "—"}</p><p className="mt-2 text-xs text-gt-emerald-bright">LIVE</p></div><div className="rounded-lg border border-gt-border p-4"><p className="text-sm font-semibold">Wallet connection</p><p className="mt-1 text-xs text-gt-muted">Sign an ownership message with your wallet. Green Tree never asks for a seed phrase or private key.</p>{verifiedWallet ? <p className="mt-3 text-sm text-gt-emerald-bright">Wallet verified successfully.<br />{verifiedWallet.slice(0, 6)}…{verifiedWallet.slice(-4)}</p> : <div className="mt-3 space-y-2"><Button className="w-full" onClick={openDialog}>{walletState === "connecting" ? "Connecting…" : publicKey ? `Connected ${adapterName ?? "wallet"}` : "Connect Wallet"}</Button>{publicKey && <Button className="w-full" variant="outline" onClick={() => void verifyWallet()} disabled={verifying}>{verifying ? "Waiting for signature…" : "Verify wallet ownership"}</Button>}</div>}</div><label className="block text-sm"><span className="text-gt-muted">SOL input</span><input value={sol} onChange={(event) => setSol(event.target.value)} inputMode="decimal" placeholder="0.00" className="mt-2 h-12 w-full rounded-md border border-gt-border bg-gt-surface px-3 text-lg" /></label><div className="rounded-lg border border-gt-border p-4"><p className="text-xs text-gt-muted">Current market preview</p><p className="mt-1 text-xl font-semibold">{estimate ? `${atomicToDecimal(estimate, 9)} GTREE` : "—"}</p><p className="mt-2 text-sm text-gt-muted">Foundation inventory: {inventory?.spendableGtree ?? "Unavailable"} GTREE</p></div><Button className="w-full" onClick={() => setNotice("Open the full Green Tree purchase page to review and sign your transaction.")} disabled={!estimate}>Review Purchase</Button>{telegramWebApp() ? <Button className="w-full" variant="outline" onClick={returnToTelegram}>Return to Telegram</Button> : <a className="block text-center text-sm text-gt-emerald-bright" href="https://t.me/Gttofficial">Open Green Tree Telegram</a>}{notice && <p role="status" className="text-sm text-amber-200">{notice}</p>}</section></main>;
}
