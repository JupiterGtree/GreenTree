import "server-only";

import type { AuthorityFact, DataMode, SolanaNetworkStatus } from "@/types/market";
import { getTokenState } from "@/data/token/get-token-state";
import { solanaRpc } from "@/services/solana/rpc";

export interface SolanaProvider {
  mode: DataMode;
  getNetworkStatus(): Promise<SolanaNetworkStatus>;
  getTokenAuthorities(): Promise<AuthorityFact[]>;
}

class LiveSolanaProvider implements SolanaProvider {
  mode: DataMode = "live";

  async getNetworkStatus(): Promise<SolanaNetworkStatus> {
    try {
      const health = await solanaRpc<string>("getHealth", []);
      return {
        network: "mainnet-beta",
        operational: health === "ok",
        label: health === "ok" ? "Solana Mainnet" : "Solana Mainnet status unavailable",
      };
    } catch {
      return { network: "mainnet-beta", operational: false, label: "Solana Mainnet status unavailable" };
    }
  }

  async getTokenAuthorities(): Promise<AuthorityFact[]> {
    const result = await getTokenState();
    const state = result.data;
    return [
      {
        id: "market-pricing",
        label: "Market Pricing",
        status: "public-market",
        explanation: "Live quotes are routed through Jupiter against the confirmed public Meteora DAMM v2 pool.",
      },
      {
        id: "transfer-freedom",
        label: "Transfer Freedom",
        status: "unrestricted",
        explanation: "GTREE is a transferable Classic SPL token on Solana Mainnet.",
      },
      {
        id: "mint-authority",
        label: "Mint Authority",
        status: state ? (state.mintAuthority.status === "revoked" ? "revoked" : "verified") : "unavailable",
        explanation: state
          ? state.mintAuthority.status === "revoked"
            ? "The finalized Solana mint account reports no mint authority. Additional GTREE cannot be minted."
            : `The Solana mint account currently reports an active authority: ${state.mintAuthority.address}.`
          : "The current mint-authority state could not be verified from Solana Mainnet.",
      },
      {
        id: "freeze-authority",
        label: "Freeze Authority",
        status: state ? (state.freezeAuthority.status === "revoked" ? "not-retained" : "verified") : "unavailable",
        explanation: state
          ? state.freezeAuthority.status === "revoked"
            ? "The finalized Solana mint account reports no freeze authority."
            : `The Solana mint account currently reports an active freeze authority: ${state.freezeAuthority.address}.`
          : "The current freeze-authority state could not be verified from Solana Mainnet.",
      },
    ];
  }
}

const provider = new LiveSolanaProvider();

export function getSolanaProvider(): SolanaProvider {
  return provider;
}
