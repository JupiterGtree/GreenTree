import { LockKeyhole, Leaf, Search, Zap, Globe2 } from "lucide-react";

const FEATURES = [
  { icon: Leaf, title: "Foundation Distribution", text: "GTREE distribution is managed through the official Foundation system with transparent records." },
  { icon: Zap, title: "Direct Purchase", text: "Users purchase GTREE directly through the official website with wallet-signed transactions." },
  { icon: Search, title: "Transparency First", text: "Important project actions, treasury records, and updates are publicly documented." },
  { icon: Globe2, title: "Environmental Mission", text: "Green Tree connects blockchain technology with verifiable environmental actions." },
];

export function FoundationPhasePanel() {
  return (
    <section className="flex min-h-[620px] min-w-0 flex-col" aria-labelledby="foundation-phase-title">
      <div className="flex items-start gap-3 border-b border-gt-border pb-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-gt-emerald/30 bg-gt-emerald/10 text-gt-emerald-bright">
          <Leaf className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gt-emerald-bright">Current phase</p>
          <h2 id="foundation-phase-title" className="mt-1 text-xl font-semibold tracking-tight text-gt-offwhite">Green Tree Foundation Phase</h2>
        </div>
      </div>

      <p className="mt-5 max-w-xl text-sm leading-6 text-gt-muted">
        Green Tree is focused on building a transparent and sustainable ecosystem. Acquire GTREE directly through the official website using Foundation Direct, while this phase prioritizes transparent distribution, community growth, ecosystem development, and verified environmental initiatives.
      </p>

      <div className="mt-6 grid flex-1 content-start gap-3 sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <article key={title} className="rounded-lg border border-gt-border bg-gt-surface/45 p-4">
            <span className="flex size-8 items-center justify-center rounded-md border border-gt-border bg-gt-surface-2 text-gt-emerald-bright">
              <Icon className="size-4" aria-hidden />
            </span>
            <h3 className="mt-3 text-sm font-semibold text-gt-fg">{title}</h3>
            <p className="mt-1.5 text-xs leading-5 text-gt-muted">{text}</p>
          </article>
        ))}
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-gt-border pt-4 text-xs text-gt-muted-2">
        <LockKeyhole className="size-3.5 text-gt-emerald-bright" aria-hidden />
        <span>Wallet-signed purchases. Public records. Foundation-led growth.</span>
      </div>
    </section>
  );
}
