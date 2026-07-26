"use client";

import * as React from "react";
import { VersionedTransaction } from "@solana/web3.js";
import { ExternalLink, RefreshCw, ShieldAlert, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/shared/copy-button";
import { useWallet } from "@/features/wallet/wallet-context";
import { DISTRIBUTION_SOURCE, type DistributionDashboard, type DistributionRecord } from "@/lib/admin/token-distribution-shared";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/constants/project";
import { ENV } from "@/lib/constants/env";

interface DistributionList {
  items: DistributionRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export function TokenDistributionAdmin({
  csrfToken,
  dashboard,
  list,
  categories,
  distributionTypes,
}: {
  csrfToken: string;
  dashboard: DistributionDashboard;
  list: DistributionList;
  categories: string[];
  distributionTypes: string[];
}) {
  const router = useRouter();
  const wallet = useWallet();
  const [state, setState] = React.useState({ message: "", error: "", busy: false });
  const [preview, setPreview] = React.useState<DistributionRecord | null>(list.items[0]?.status === "previewed" ? list.items[0] : null);
  const [form, setForm] = React.useState({
    recipientWalletAddress: "",
    amountGtree: "",
    allocationCategory: categories[0] ?? "Community Pool",
    distributionType: distributionTypes[0] ?? "Manual Distribution",
    internalNote: "",
    publicDescription: "",
    externalReference: "",
  });
  const [confirmation, setConfirmation] = React.useState("");

  async function refresh() {
    router.refresh();
  }

  async function createPreview(event: React.FormEvent) {
    event.preventDefault();
    setState({ message: "", error: "", busy: true });
    try {
      const response = await fetch("/admin/api/token-distributions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          ...form,
          idempotencyKey: crypto.randomUUID(),
          connectedFeePayerAddress: wallet.wallet?.address ?? null,
        }),
      });
      const body = await response.json() as { record?: DistributionRecord; error?: string };
      if (!response.ok || !body.record) throw new Error(body.error || "Preview failed.");
      setPreview(body.record);
      setState({ message: "Preview saved. Review the fixed source, recipient, amount, and fee payer before confirming.", error: "", busy: false });
      router.refresh();
    } catch (error) {
      setState({ message: "", error: error instanceof Error ? error.message : "Preview failed.", busy: false });
    }
  }

  async function prepareWalletSignature() {
    if (!preview || !wallet.wallet) return;
    setState({ message: "", error: "", busy: true });
    try {
      const prepared = await fetch(`/admin/api/token-distributions/${preview.uuid}/prepare-wallet-signature`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ connectedWalletAddress: wallet.wallet.address }),
      }).then(async (response) => {
        const body = await response.json() as { transactionBase64?: string; error?: string };
        if (!response.ok || !body.transactionBase64) throw new Error(body.error || "Unable to prepare wallet signature.");
        return body.transactionBase64;
      });
      const tx = VersionedTransaction.deserialize(base64ToBytes(prepared));
      const signed = await wallet.signTransaction(tx);
      const signedBase64 = bytesToBase64(signed.serialize());
      await submit("CONNECTED_ADMIN", signedBase64);
    } catch (error) {
      setState({ message: "", error: error instanceof Error ? error.message : "Wallet signing failed.", busy: false });
    }
  }

  async function submit(mode: "SERVER" | "CONNECTED_ADMIN", signedTransactionBase64?: string) {
    if (!preview) return;
    setState({ message: "", error: "", busy: true });
    try {
      const response = await fetch(`/admin/api/token-distributions/${preview.uuid}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ phrase: confirmation, mode, signedTransactionBase64 }),
      });
      const body = await response.json() as { record?: DistributionRecord; error?: string };
      if (!response.ok || !body.record) throw new Error(body.error || "Submission failed.");
      setPreview(body.record);
      setState({ message: "Submission request accepted.", error: "", busy: false });
      router.refresh();
    } catch (error) {
      setState({ message: "", error: error instanceof Error ? error.message : "Submission failed.", busy: false });
    }
  }

  const serverFunded = BigInt(dashboard.source.serverSignerSolLamports) > BigInt(dashboard.config.minSolBalanceLamports);
  const realSubmissionDisabled = !dashboard.config.enabled || dashboard.config.dryRun;
  const connectedWalletReady = wallet.wallet && BigInt(wallet.wallet.solBalanceLamports) > BigInt(dashboard.config.minSolBalanceLamports);

  return (
    <section className="space-y-7">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-gt-emerald-bright">Token distribution</p>
        <h1 className="mt-2 text-3xl font-semibold">Manual GTREE distribution</h1>
        <p className="mt-2 text-sm text-gt-muted">
          {dashboard.config.enabled && !dashboard.config.dryRun
            ? "OWNER-only distribution console. Production activation is enabled with real transfers available after preview, fee-payer validation, and explicit OWNER confirmation."
            : "OWNER-only distribution console. Production is deployed with real transfers disabled and dry-run enabled until explicit activation."}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <Metric label="Source GTREE balance" value={`${dashboard.source.sourceBalanceGtree} GTREE`} />
        <Metric label="Confirmed transfers" value={String(dashboard.stats.confirmedTransfers)} />
        <Metric label="Pending transfers" value={String(dashboard.stats.pendingTransfers)} />
        <Metric label="Module mode" value={dashboard.config.enabled ? "Enabled" : "Disabled"} tone={dashboard.config.enabled ? "ok" : "warn"} />
      </div>

      <section className="rounded-lg border border-gt-border bg-gt-charcoal/45 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Transaction Fee Payer</h2>
            <p className="mt-1 text-sm text-gt-muted">Fee payer can be the existing server delegate signer or a connected OWNER wallet. GTREE authority remains fixed.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()}><RefreshCw className="size-4" /> Refresh balance</Button>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <AddressPanel
            title="Existing server signer"
            address={DISTRIBUTION_SOURCE.delegateSigner}
            lines={[
              ["Current mode", dashboard.config.feePayerMode],
              ["SOL balance", `${dashboard.source.serverSignerSol} SOL`],
              ["Minimum configured SOL", `${lamportsToSol(dashboard.config.minSolBalanceLamports)} SOL`],
              ["Ready", serverFunded ? "Server fee payer ready" : "Fee payer funding required"],
            ]}
            warning={!serverFunded ? "Fee payer funding required. Send only SOL for network fees and ATA creation. Do not send GTREE to this address for distribution purposes." : null}
          />
          <div className="rounded-lg border border-gt-border bg-gt-surface/45 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">Connected admin wallet</h3>
              {wallet.wallet ? <Button variant="outline" size="sm" onClick={() => void wallet.disconnect()}>Disconnect Wallet</Button> : <Button size="sm" onClick={wallet.openDialog}><Wallet className="size-4" /> Connect Wallet</Button>}
            </div>
            {wallet.wallet ? (
              <div className="mt-3 space-y-2 text-sm">
                <AddressRow value={wallet.wallet.address} />
                <p className="text-gt-muted">SOL balance: <span className="font-mono text-gt-fg">{wallet.wallet.solBalanceLamports} lamports</span></p>
                <Badge variant={connectedWalletReady ? "emerald" : "warning"}>{connectedWalletReady ? "Connected wallet ready" : "Connected wallet has insufficient SOL"}</Badge>
              </div>
            ) : (
              <p className="mt-3 text-sm text-gt-muted">Waiting for admin wallet connection</p>
            )}
          </div>
        </div>
        {!serverFunded && !connectedWalletReady && (
          <p className="mt-4 rounded-md border border-gt-warning/30 bg-gt-warning/10 px-3 py-2 text-sm text-gt-warning">
            Waiting for a fee payer
          </p>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <form onSubmit={createPreview} className="rounded-lg border border-gt-border bg-gt-charcoal/45 p-5">
          <h2 className="text-lg font-semibold">Create transfer preview</h2>
          <div className="mt-5 grid gap-3">
            <Label text="Recipient Solana Wallet Address"><Input value={form.recipientWalletAddress} onChange={(e) => setForm({ ...form, recipientWalletAddress: e.target.value })} required /></Label>
            <Label text="GTREE Amount"><Input value={form.amountGtree} onChange={(e) => setForm({ ...form, amountGtree: e.target.value })} placeholder="0.000000001" required /></Label>
            <Label text="Allocation Category"><Select value={form.allocationCategory} onChange={(allocationCategory) => setForm({ ...form, allocationCategory })} options={categories} /></Label>
            <Label text="Distribution Type"><Select value={form.distributionType} onChange={(distributionType) => setForm({ ...form, distributionType })} options={distributionTypes} /></Label>
            <Label text="Internal Note"><textarea value={form.internalNote} onChange={(e) => setForm({ ...form, internalNote: e.target.value })} className="min-h-20 rounded-md border border-gt-border bg-gt-surface px-3 py-2 text-sm" /></Label>
            <Label text="Public Description"><Input value={form.publicDescription} onChange={(e) => setForm({ ...form, publicDescription: e.target.value })} /></Label>
            <Label text="External Reference"><Input value={form.externalReference} onChange={(e) => setForm({ ...form, externalReference: e.target.value })} /></Label>
          </div>
          <div className="mt-4 rounded-md border border-gt-border bg-gt-surface/45 p-3 text-xs text-gt-muted">
            <p>Source wallet, source token account, token mint, and delegate signer are fixed server-side.</p>
            <p className="mt-1 break-all">Source token account: {DISTRIBUTION_SOURCE.sourceTokenAccount}</p>
          </div>
          <Button className="mt-5 w-full" disabled={state.busy}>{state.busy ? "Working..." : "Preview Transaction"}</Button>
        </form>

        <section className="rounded-lg border border-gt-border bg-gt-charcoal/45 p-5">
          <h2 className="text-lg font-semibold">Preview and confirmation</h2>
          {preview ? (
            <div className="mt-4 space-y-3 text-sm">
              <PreviewRow label="Recipient wallet" value={preview.recipientWalletAddress} copy />
              <PreviewRow label="Recipient GTREE ATA" value={preview.recipientTokenAccount} copy />
              <PreviewRow label="Recipient ATA existed" value={preview.recipientTokenAccountExisted ? "Yes" : "No, idempotent ATA creation required"} />
              <PreviewRow label="Amount" value={`${preview.amountGtree} GTREE`} />
              <PreviewRow label="Base units" value={preview.amountBaseUnits} />
              <PreviewRow label="Fee payer" value={preview.feePayerAddress ?? "Waiting for a fee payer"} copy={Boolean(preview.feePayerAddress)} />
              <PreviewRow label="Estimated fee" value={`${preview.estimatedFeeLamports ?? "0"} lamports`} />
              <PreviewRow label="Estimated ATA rent" value={`${preview.estimatedAtaRentLamports ?? "0"} lamports`} />
              <PreviewRow label="Total estimated SOL cost" value={`${preview.estimatedTotalCostLamports ?? "0"} lamports`} />
              <PreviewRow label="Status" value={preview.status} />
              <PreviewRow label="Dry-run" value={preview.dryRun ? "Yes - no Mainnet transfer will be submitted" : "No"} />
              <div className="rounded-md border border-gt-warning/30 bg-gt-warning/10 p-3 text-gt-warning">
                <ShieldAlert className="mr-2 inline size-4" /> Blockchain transfers cannot be reversed. Verify the full recipient address before signing.
              </div>
              <Input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="CONFIRM TRANSFER" />
              {realSubmissionDisabled && <p className="text-xs text-gt-muted">Real submission is disabled by configuration. Dry-run preview is available and recorded.</p>}
              <div className="flex flex-wrap gap-2">
                <Button disabled={realSubmissionDisabled || !serverFunded || confirmation !== "CONFIRM TRANSFER" || state.busy} onClick={() => void submit("SERVER")}>Submit with server fee payer</Button>
                <Button variant="secondary" disabled={realSubmissionDisabled || !connectedWalletReady || confirmation !== "CONFIRM TRANSFER" || state.busy} onClick={() => void prepareWalletSignature()}>Sign with connected fee payer</Button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gt-muted">Create a preview to inspect the full transaction details.</p>
          )}
        </section>
      </section>

      {(state.error || state.message) && (
        <p role="status" className={`rounded-md border px-3 py-2 text-sm ${state.error ? "border-gt-danger/30 bg-gt-danger/10 text-gt-danger" : "border-gt-emerald/30 bg-gt-emerald/10 text-gt-emerald-bright"}`}>
          {state.error || state.message}
        </p>
      )}

      <section className="rounded-lg border border-gt-border">
        <div className="flex items-center justify-between gap-3 border-b border-gt-border p-4">
          <h2 className="font-semibold">Distribution history</h2>
          <Button variant="outline" size="sm" onClick={() => { window.location.href = "/admin/api/token-distributions/export"; }}>Export CSV</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-gt-surface text-xs uppercase tracking-wide text-gt-muted">
              <tr><th className="p-3">Date</th><th className="p-3">Recipient</th><th className="p-3">Amount</th><th className="p-3">Category</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Signature</th><th className="p-3">Reference</th></tr>
            </thead>
            <tbody>
              {list.items.map((item) => (
                <tr key={item.uuid} className="border-t border-gt-border align-top">
                  <td className="p-3 text-xs text-gt-muted">{new Date(item.createdAt).toLocaleString()}</td>
                  <td className="p-3"><AddressRow value={item.recipientWalletAddress} /></td>
                  <td className="p-3 font-mono">{item.amountGtree}</td>
                  <td className="p-3">{item.allocationCategory}</td>
                  <td className="p-3">{item.distributionType}</td>
                  <td className="p-3"><Badge variant={item.status === "confirmed" ? "emerald" : item.status === "failed" ? "danger" : "neutral"}>{item.status}</Badge></td>
                  <td className="p-3">{item.transactionSignature ? <a className="text-gt-emerald-bright hover:underline" href={explorerTxUrl(ENV.solscanBaseUrl, item.transactionSignature)} target="_blank" rel="noreferrer">{shorten(item.transactionSignature)}</a> : <span className="text-gt-muted">None</span>}</td>
                  <td className="p-3 text-xs text-gt-muted">{item.externalReference ?? ""}</td>
                </tr>
              ))}
              {!list.items.length && <tr><td colSpan={8} className="p-8 text-center text-gt-muted">No distribution records yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return <div className="rounded-lg border border-gt-border bg-gt-charcoal/45 p-4"><p className="text-xs text-gt-muted">{label}</p><p className={tone === "warn" ? "mt-2 text-xl font-semibold text-gt-warning" : "mt-2 text-xl font-semibold"}>{value}</p></div>;
}

function AddressPanel({ title, address, lines, warning }: { title: string; address: string; lines: Array<[string, string]>; warning: string | null }) {
  return (
    <div className="rounded-lg border border-gt-border bg-gt-surface/45 p-4">
      <h3 className="font-medium">{title}</h3>
      <AddressRow value={address} />
      <dl className="mt-3 grid gap-2 text-sm">
        {lines.map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt className="text-gt-muted">{label}</dt><dd className="text-right font-mono">{value}</dd></div>)}
      </dl>
      {warning && <p className="mt-3 rounded-md border border-gt-warning/30 bg-gt-warning/10 p-2 text-xs text-gt-warning">{warning}</p>}
    </div>
  );
}

function AddressRow({ value }: { value: string }) {
  return <div className="mt-2 flex items-center gap-1 break-all font-mono text-xs"><span>{value}</span><CopyButton value={value} iconOnly /><a href={explorerAddressUrl(ENV.solscanBaseUrl, value)} target="_blank" rel="noreferrer" className="text-gt-muted hover:text-gt-emerald-bright"><ExternalLink className="size-3.5" /></a></div>;
}

function PreviewRow({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  return <div className="flex flex-col gap-1 border-b border-gt-border-soft pb-2 sm:flex-row sm:justify-between"><dt className="text-gt-muted">{label}</dt><dd className="break-all font-mono text-xs text-gt-fg">{value}{copy && <CopyButton value={value} iconOnly />}</dd></div>;
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-sm"><span className="text-gt-muted">{text}</span>{children}</label>;
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-md border border-gt-border bg-gt-surface px-3 text-sm">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
}

function lamportsToSol(value: string) {
  const raw = BigInt(value || "0").toString().padStart(10, "0");
  const whole = raw.slice(0, -9);
  const fraction = raw.slice(-9).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function shorten(value: string) {
  return value.length <= 18 ? value : `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}
