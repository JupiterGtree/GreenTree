import { TokenAddress } from "@/components/shared/token-address";
import { ENV } from "@/lib/constants/env";

export function MintAddressPanel() {
  return (
    <div className="surface-card flex w-full flex-col gap-4 rounded-lg p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gt-muted">GTREE mint address</p>
        <p className="mt-1.5 text-sm leading-relaxed text-gt-muted-2">
          Verify this address independently before interacting with GTREE.
        </p>
      </div>
      <TokenAddress address={ENV.gtreeMint} chars={6} className="w-fit max-w-full shrink-0" />
    </div>
  );
}
