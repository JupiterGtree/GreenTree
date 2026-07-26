import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ReceiptCopyActions } from "@/components/receipt/receipt-copy-actions";
import { TokenReceiptService } from "@/lib/admin/token-receipts";
import { isValidReceiptPublicId, receiptUrl, shortenMiddle, solscanTxUrl } from "@/lib/admin/token-receipt-shared";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ publicReceiptId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { publicReceiptId } = await params;
  if (!isValidReceiptPublicId(publicReceiptId)) return {};
  const receipt = new TokenReceiptService().getPublic(publicReceiptId);
  if (!receipt) return {};
  const url = receiptUrl(receipt.publicId);
  return {
    title: "Green Tree GTREE Transfer Receipt",
    description: "Verified GTREE transfer receipt on Solana.",
    openGraph: {
      title: "Green Tree GTREE Transfer Receipt",
      description: "Verified GTREE transfer receipt on Solana.",
      url,
      images: [{ url: `/r/${receipt.publicId}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Green Tree GTREE Transfer Receipt",
      description: "Verified GTREE transfer receipt on Solana.",
      images: [`/r/${receipt.publicId}/opengraph-image`],
    },
  };
}

export default async function ReceiptPage({ params }: PageProps) {
  const { publicReceiptId } = await params;
  if (!isValidReceiptPublicId(publicReceiptId)) notFound();
  const receipt = new TokenReceiptService().getPublic(publicReceiptId);
  if (!receipt) notFound();
  const publicUrl = receiptUrl(receipt.publicId);
  const status = statusView(receipt.status);

  return (
    <main className="min-h-screen overflow-hidden bg-[#031111] px-4 py-8 text-gt-fg sm:px-6 print:bg-white print:text-black">
      <div className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(circle_at_20%_10%,rgba(0,229,214,0.18),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(53,211,153,0.14),transparent_28%),linear-gradient(140deg,rgba(4,18,18,1),rgba(3,10,11,1))] print:hidden" />
      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl items-center">
        <article className="w-full rounded-[2rem] border border-gt-border/80 bg-gt-charcoal/75 p-5 shadow-2xl shadow-black/35 backdrop-blur-xl sm:p-8 print:border-slate-300 print:bg-white print:shadow-none">
          <header className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="Green Tree" width={52} height={52} className="rounded-full" priority />
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.22em] text-gt-emerald-bright print:text-emerald-700">Green Tree</p>
                <h1 className="text-2xl font-semibold">GTREE Transfer Receipt</h1>
              </div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
          </header>

          <div className="mt-8 rounded-3xl border border-gt-border-soft bg-gt-surface/50 p-5 text-center print:border-slate-200 print:bg-slate-50">
            <p className="text-sm text-gt-muted print:text-slate-600">{status.text}</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-gt-emerald-bright sm:text-5xl print:text-emerald-700">{receipt.amountGtree}</p>
            <p className="mt-1 font-mono text-sm text-gt-muted print:text-slate-600">GTREE</p>
            {receipt.publicDescription && <p className="mt-4 text-sm text-gt-fg print:text-slate-800">{receipt.publicDescription}</p>}
          </div>

          <dl className="mt-6 grid gap-3 text-sm">
            <ReceiptRow label="Recipient wallet" value={shortenMiddle(receipt.recipientWallet, 8, 8)} full={receipt.recipientWallet} />
            <ReceiptRow label="Transaction date" value={receipt.confirmedAt ? new Date(receipt.confirmedAt).toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC" : "Awaiting confirmation"} />
            <ReceiptRow label="Receipt ID" value={receipt.publicId} />
            <ReceiptRow label="Network" value={receipt.network} />
            <ReceiptRow label="Transaction signature" value={shortenMiddle(receipt.transactionSignature, 10, 10)} full={receipt.transactionSignature} />
          </dl>

          <div className="mt-7 grid gap-3">
            <a href={solscanTxUrl(receipt.transactionSignature)} target="_blank" rel="noreferrer noopener" className="rounded-full bg-gt-emerald px-4 py-3 text-center text-sm font-semibold text-gt-night transition hover:bg-gt-emerald-bright print:border print:border-slate-300 print:bg-white print:text-black">
              View on Solscan
            </a>
            <ReceiptCopyActions receiptUrl={publicUrl} transactionSignature={receipt.transactionSignature} />
          </div>

          <footer className="mt-8 border-t border-gt-border-soft pt-5 text-center text-xs text-gt-muted print:border-slate-200 print:text-slate-600">
            <p>Issued by Green Tree · gtree.land</p>
            <p className="mt-1 text-gt-emerald-bright print:text-emerald-700">Grow Together.</p>
          </footer>
        </article>
      </section>
    </main>
  );
}

function ReceiptRow({ label, value, full }: { label: string; value: string; full?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-gt-border-soft bg-gt-surface/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between print:border-slate-200 print:bg-white">
      <dt className="text-gt-muted print:text-slate-600">{label}</dt>
      <dd className="break-all font-mono text-sm" title={full ?? value} aria-label={full ?? value}>{value}</dd>
    </div>
  );
}

function statusView(status: string) {
  if (status === "confirmed") return { label: "Confirmed", text: "Confirmed on Solana", className: "border-gt-emerald/40 bg-gt-emerald/10 text-gt-emerald-bright print:text-emerald-700" };
  if (status === "failed") return { label: "Failed", text: "Transfer failed on Solana", className: "border-gt-danger/40 bg-gt-danger/10 text-gt-danger print:text-red-700" };
  return { label: "Submitted", text: "Awaiting blockchain confirmation", className: "border-gt-border bg-gt-surface text-gt-muted print:text-slate-700" };
}
