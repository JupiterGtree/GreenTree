import { BarChart3, FileCheck2, Globe2, Leaf, LockKeyhole, ShieldCheck, Users, WalletCards } from "lucide-react";

const PRINCIPLES = [
  { icon: ShieldCheck, title: "Transparent Foundation", text: "Distribution records, treasury activity, and important project actions remain documented and verifiable." },
  { icon: WalletCards, title: "Direct Purchase", text: "GTREE is acquired directly through the official website, without presenting the Foundation as a DEX." },
  { icon: Users, title: "Community First", text: "Open participation and responsible ownership help the ecosystem grow with its community." },
  { icon: Globe2, title: "Environmental Mission", text: "Blockchain infrastructure is connected to practical, verifiable environmental initiatives." },
  { icon: BarChart3, title: "Sustainable Growth", text: "The Foundation prioritizes steady ecosystem development over short-term market-driven activity." },
  { icon: FileCheck2, title: "Verifiable Records", text: "On-chain ownership and public updates provide an open record that anyone can review." },
];

const STEPS = [
  ["Choose amount", "Enter the SOL amount you want to use."],
  ["Review transaction", "Check the rate, output, and destination."],
  ["Sign with wallet", "Approve the transaction in your wallet."],
  ["Secure execution", "The signed transaction is submitted and confirmed on Solana."],
] as const;

export function FoundationPhasePanel() {
  return (
    <section className="flex min-h-[760px] min-w-0 flex-col" aria-labelledby="foundation-phase-title">
      <header className="flex items-start gap-3 border-b border-gt-border pb-5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-gt-emerald/30 bg-gt-emerald/10 text-gt-emerald-bright"><Leaf className="size-6" aria-hidden /></span>
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gt-emerald-bright">Current phase</p><h2 id="foundation-phase-title" className="mt-1 text-xl font-semibold tracking-tight text-gt-offwhite">Green Tree Foundation Phase</h2><p className="mt-1 text-xs text-gt-muted">Building today for a greener, transparent tomorrow.</p></div>
      </header>
      <p className="mt-5 text-sm leading-6 text-gt-muted">Green Tree is currently in its Foundation Phase, focused on building a strong and transparent ecosystem and connecting blockchain technology with real environmental impact. Users can acquire GTREE directly through the official website using Foundation Direct with wallet-signed transactions.</p>

      <div className="mt-5 rounded-lg border border-gt-border bg-gt-surface/35 p-4"><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-gt-emerald-bright">How it works</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">{STEPS.map(([title, text], index) => <div key={title} className="flex gap-2.5"><span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-gt-emerald/30 bg-gt-emerald/10 text-[10px] font-bold text-gt-emerald-bright">{index + 1}</span><div><p className="text-xs font-semibold text-gt-fg">{title}</p><p className="mt-0.5 text-[11px] leading-4 text-gt-muted">{text}</p></div></div>)}</div></div>

      <div className="mt-5 flex-1"><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-gt-emerald-bright">Foundation principles</h3><div className="mt-3 grid gap-2.5 sm:grid-cols-2">{PRINCIPLES.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-lg border border-gt-border bg-gt-surface/45 p-3.5"><div className="flex items-start gap-2.5"><span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-gt-border bg-gt-surface-2 text-gt-emerald-bright"><Icon className="size-4" aria-hidden /></span><div><h4 className="text-xs font-semibold text-gt-fg">{title}</h4><p className="mt-1 text-[11px] leading-4 text-gt-muted">{text}</p></div></div></article>)}</div></div>

      <footer className="mt-5 rounded-lg border border-gt-border bg-gt-surface/55 p-3.5"><div className="flex items-center gap-2.5"><LockKeyhole className="size-4 shrink-0 text-gt-emerald-bright" aria-hidden /><p className="text-xs font-semibold text-gt-fg">Wallet-signed purchases · Public records · Foundation-led growth</p></div><p className="mt-1.5 pl-6 text-[11px] leading-4 text-gt-muted">Open and secure ownership is the foundation for community participation and long-term environmental action.</p></footer>
    </section>
  );
}
