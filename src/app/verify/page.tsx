import Image from "next/image";
import type { Metadata } from "next";
import { ExternalLink, FileCheck2, ShieldCheck } from "lucide-react";
import { PROJECT, TREASURY } from "@/lib/constants/project";

export const metadata: Metadata = {
  title: "Official Verification Record",
  description: "The canonical Green Tree (GTREE) identity and token verification record.",
};

const links = [
  { label: "Official website", href: PROJECT.website },
  { label: "Official X account", href: PROJECT.officialX },
  { label: "Official Telegram", href: PROJECT.telegram },
  { label: "Token metadata", href: PROJECT.metadataUrl },
  { label: "Whitepaper (PDF)", href: "/docs/Green_Tree_Whitepaper_v2.0.0.pdf" },
  { label: "Official document library", href: "/docs" },
  { label: "Transparency Center", href: "/transparency" },
];

function ExternalRow({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = href ? (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined} className="inline-flex items-center gap-1.5 break-all text-gt-emerald-bright hover:text-gt-offwhite">
      {value}<ExternalLink className="size-3.5 shrink-0" aria-hidden />
    </a>
  ) : value;
  return <div className="grid gap-1 border-b border-gt-border/70 py-3 last:border-b-0 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] sm:gap-4"><dt className="text-xs font-semibold uppercase tracking-[0.14em] text-gt-muted-2">{label}</dt><dd className="break-words text-sm text-gt-fg">{content}</dd></div>;
}

export default function VerifyPage() {
  return (
    <main className="container-gt pb-20 pt-10 sm:pt-16">
      <section className="mx-auto max-w-4xl">
        <div className="surface-card rounded-2xl p-6 sm:p-10">
          <div className="flex flex-col gap-5 border-b border-gt-border pb-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Image src="/logo.png" alt="Green Tree logo" width={64} height={64} className="size-16 rounded-full" priority />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gt-emerald-bright">Official verification record</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gt-fg sm:text-4xl">Green Tree <span className="text-gt-emerald-bright">(GTREE)</span></h1>
                <p className="mt-2 text-sm text-gt-muted">A canonical identity record for third-party verification.</p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-gt-emerald/40 bg-gt-emerald/10 px-3 py-2 text-xs font-semibold text-gt-emerald-bright sm:self-auto"><ShieldCheck className="size-4" aria-hidden /> Official project record</div>
          </div>

          <div className="grid gap-6 py-8 lg:grid-cols-2">
            <div className="rounded-xl border border-gt-border bg-gt-charcoal/35 p-5">
              <div className="mb-4 flex items-center gap-2 text-gt-fg"><FileCheck2 className="size-5 text-gt-emerald-bright" aria-hidden /><h2 className="font-semibold">Token identity</h2></div>
              <dl>
                <ExternalRow label="Network" value={PROJECT.network} />
                <ExternalRow label="Token standard" value={PROJECT.tokenStandard} />
                <ExternalRow label="Decimals" value={String(PROJECT.decimals)} />
                <ExternalRow label="Maximum supply" value="1,000,000,000 GTREE" />
                <ExternalRow label="Token mint" value={PROJECT.mint} href={`https://solscan.io/token/${PROJECT.mint}`} />
                <ExternalRow label="Metadata URL" value={PROJECT.metadataUrl} href={PROJECT.metadataUrl} />
              </dl>
            </div>

            <div className="rounded-xl border border-gt-border bg-gt-charcoal/35 p-5">
              <div className="mb-4 flex items-center gap-2 text-gt-fg"><ShieldCheck className="size-5 text-gt-emerald-bright" aria-hidden /><h2 className="font-semibold">Authority and treasury checks</h2></div>
              <dl>
                <ExternalRow label="Mint Authority" value="Revoked after fixed-supply allocation verification (launch policy)." href="/transparency" />
                <ExternalRow label="Freeze Authority" value="Not retained for ordinary user-token control (launch policy)." href="/transparency" />
                <ExternalRow label="Treasury control" value={`${TREASURY.threshold} Squads multisig`} href="/transparency" />
                <ExternalRow label="Treasury vault" value={TREASURY.vault} href={`https://solscan.io/account/${TREASURY.vault}`} />
                <ExternalRow label="Transparency records" value="Authorities, treasury, liquidity and mission reporting" href="/transparency" />
              </dl>
            </div>
          </div>

          <div className="rounded-xl border border-gt-border bg-gt-charcoal/35 p-5">
            <h2 className="font-semibold text-gt-fg">Official project links</h2>
            <p className="mt-2 text-sm leading-6 text-gt-muted">These links are published by Green Tree and are intended to be checked together with the token mint and metadata record.</p>
            <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {links.map((link) => <a key={link.label} href={link.href} target={link.href.startsWith("http") ? "_blank" : undefined} rel={link.href.startsWith("http") ? "noreferrer" : undefined} className="inline-flex items-center gap-2 text-sm text-gt-emerald-bright hover:text-gt-offwhite"><span>{link.label}</span><ExternalLink className="size-3.5" aria-hidden /></a>)}
            </div>
          </div>

          <p className="mt-6 text-xs leading-5 text-gt-muted-2">This page is an identity and verification reference, not an offer, price guarantee, or statement that market risk is absent. For the underlying policy language and source documents, use the linked Transparency Center and document library.</p>
        </div>
      </section>
    </main>
  );
}
