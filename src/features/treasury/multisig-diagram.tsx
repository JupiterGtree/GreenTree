import { ShieldCheck, User } from "lucide-react";
import { TREASURY } from "@/lib/constants/project";

export function MultisigDiagram() {
  return (
    <div
      role="img"
      aria-label="Diagram showing that treasury actions require approval from both authorized founder members through the Squads 2-of-2 multisig before reaching the treasury vault"
      className="glass-surface-b flex flex-col items-center gap-4 rounded-lg px-6 py-8 sm:flex-row sm:justify-between sm:gap-6"
    >
      <div className="flex gap-4">
        {TREASURY.members.map((member) => (
          <div key={member.address} className="flex flex-col items-center gap-2 text-center">
            <span className="flex size-12 items-center justify-center rounded-full border border-gt-border bg-gt-surface-2 text-gt-emerald-bright">
              <User className="size-5" aria-hidden />
            </span>
            <span className="text-xs font-medium text-gt-fg">{member.label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-1 items-center gap-3">
        <span className="h-px flex-1 bg-gt-border sm:block" aria-hidden />
        <div className="flex flex-col items-center gap-1 rounded-lg border border-gt-emerald/30 bg-gt-emerald/10 px-4 py-3 text-center">
          <ShieldCheck className="size-5 text-gt-emerald-bright" aria-hidden />
          <span className="text-xs font-semibold text-gt-emerald-bright">{TREASURY.threshold} approval</span>
          <span className="text-[11px] text-gt-muted-2">Squads v4</span>
        </div>
        <span className="h-px flex-1 bg-gt-border sm:block" aria-hidden />
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full border border-gt-gold/30 bg-gt-gold/10 text-gt-gold-bright">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <span className="text-xs font-medium text-gt-fg">Treasury Vault</span>
      </div>
    </div>
  );
}
