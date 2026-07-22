import { Badge } from "@/components/ui/badge";
import { PROJECT } from "@/lib/constants/project";
import { formatNumber } from "@/lib/formatters/number";
import type { DataResult } from "@/types/data";
import type { TokenState } from "@/types/token";

export function TokenFactsPanel({ tokenState }: { tokenState: DataResult<TokenState> }) {
  const state = tokenState.data;
  const facts = [
    { label: "Network", value: PROJECT.network, isShort: true },
    { label: "Standard", value: state?.standard ?? "Unable to verify", isShort: true },
    { label: "Decimals", value: state?.decimals.toString() ?? "Unable to verify", isShort: true },
    {
      label: "Maximum supply",
      value: state
        ? `${formatNumber(Number(state.supplyUi), { compact: true })} GTREE${state.fixedSupplyVerified ? " (fixed)" : ""}`
        : "Unable to verify",
      isShort: false,
    },
    { label: "Transferability", value: "Freely transferable, no buyer lock", isShort: false },
    { label: "Pricing model", value: "Public-market pricing only", isShort: false },
  ];

  return (
    <article className="surface-card flex h-full flex-col rounded-lg p-5 sm:p-6">
      <header className="border-b border-gt-border-soft pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-gt-fg">Technical Token Facts</h3>
          <Badge variant={state ? "emerald" : "neutral"}>
            {state ? "Verified on-chain" : "Unable to verify"}
          </Badge>
        </div>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-gt-muted">
          Technical token facts translated into understandable status indicators.
        </p>
      </header>

      <dl className="mt-5 grid flex-1 auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2">
        {facts.map((fact) => (
          <div 
            key={fact.label} 
            className="glass-surface-b flex min-h-[88px] flex-col rounded-lg px-4 py-3"
          >
            {/* Label fixed at top */}
            <dt className="text-[11px] font-medium uppercase tracking-wide text-gt-muted-2">{fact.label}</dt>
            {/* Value centered in remaining space */}
            <div className="flex flex-1 items-center justify-center">
              <dd 
                className={
                  fact.isShort
                    ? "text-center text-lg font-semibold leading-tight text-gt-offwhite"
                    : "text-center text-sm font-medium leading-snug text-gt-offwhite"
                }
              >
                {fact.value}
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </article>
  );
}
