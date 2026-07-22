import { MultisigDiagram } from "@/features/treasury/multisig-diagram";
import { TokenAddress } from "@/components/shared/token-address";
import { TREASURY } from "@/lib/constants/project";

export function TreasuryControl() {
  return (
    <div className="flex flex-col gap-6">
      <MultisigDiagram />
      <p className="text-sm leading-relaxed text-gt-muted">
        Material treasury actions require approval from both authorized members before execution.
        No single party can move treasury-controlled assets alone.
      </p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gt-border bg-gt-surface px-4 py-3">
          <dt className="text-xs font-medium text-gt-muted">Squads v4 Program</dt>
          <dd className="mt-1.5"><TokenAddress address={TREASURY.squadsProgram} chars={6} /></dd>
        </div>
        <div className="rounded-lg border border-gt-border bg-gt-surface px-4 py-3">
          <dt className="text-xs font-medium text-gt-muted">Multisig Account</dt>
          <dd className="mt-1.5"><TokenAddress address={TREASURY.multisig} chars={6} /></dd>
        </div>
        <div className="rounded-lg border border-gt-border bg-gt-surface px-4 py-3">
          <dt className="text-xs font-medium text-gt-muted">Treasury Vault</dt>
          <dd className="mt-1.5"><TokenAddress address={TREASURY.vault} chars={6} /></dd>
        </div>
        <div className="rounded-lg border border-gt-border bg-gt-surface px-4 py-3">
          <dt className="text-xs font-medium text-gt-muted">Threshold</dt>
          <dd className="mt-1.5 text-sm font-semibold text-gt-fg">{TREASURY.threshold}</dd>
        </div>
      </dl>
    </div>
  );
}
