import { AuthoritiesControlPanel } from "@/features/token/authorities-control-panel";
import { MintAddressPanel } from "@/features/token/mint-address-panel";
import { TokenFactsPanel } from "@/features/token/token-facts-panel";
import { getSolanaProvider } from "@/lib/providers/solana-provider";
import { getTokenState } from "@/data/token/get-token-state";

export async function TokenStatePanel() {
  const [authorities, tokenState] = await Promise.all([
    getSolanaProvider().getTokenAuthorities(),
    getTokenState(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <TokenFactsPanel tokenState={tokenState} />
        <AuthoritiesControlPanel authorities={authorities} />
      </div>
      <MintAddressPanel />
    </div>
  );
}
