import "server-only";

import { unstable_cache } from "next/cache";
import { PublicKey } from "@solana/web3.js";
import { PROJECT } from "@/lib/constants/project";
import { ENV } from "@/lib/constants/env";
import { solanaRpc } from "@/services/solana/rpc";
import { readyData, unavailableData, type DataResult } from "@/types/data";
import type { TokenState } from "@/types/token";

const CLASSIC_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const MAINNET_GENESIS_HASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

interface ParsedMintAccount {
  value: {
    owner: string;
    data: {
      program: string;
      parsed: {
        type: string;
        info: {
          decimals: number;
          supply: string;
          isInitialized: boolean;
          mintAuthority: string | null;
          freezeAuthority: string | null;
        };
      };
    };
  } | null;
}

interface TokenSupplyResponse {
  value: {
    amount: string;
    decimals: number;
    uiAmountString: string;
  };
}

function validAuthority(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

async function readVerifiedTokenState(): Promise<TokenState> {
  new PublicKey(ENV.gtreeMint);
  const [genesisHash, account, supply] = await Promise.all([
      solanaRpc<string>("getGenesisHash", []),
      solanaRpc<ParsedMintAccount>("getAccountInfo", [
        ENV.gtreeMint,
        { encoding: "jsonParsed", commitment: "finalized" },
      ]),
      solanaRpc<TokenSupplyResponse>("getTokenSupply", [
        ENV.gtreeMint,
        { commitment: "finalized" },
      ]),
  ]);

  if (genesisHash !== MAINNET_GENESIS_HASH) {
    throw new Error("The configured RPC endpoint is not Solana Mainnet.");
  }

  const value = account.value;
  if (!value) throw new Error("Solana did not return the GTREE mint account.");
  const info = value.data.parsed.info;
  if (
    value.owner !== CLASSIC_TOKEN_PROGRAM ||
    value.data.parsed.type !== "mint" ||
    !Number.isInteger(info.decimals) ||
    info.decimals < 0 ||
    info.decimals > 18 ||
    typeof info.supply !== "string" ||
    !/^\d+$/.test(info.supply) ||
    typeof info.isInitialized !== "boolean" ||
    !validAuthority(info.mintAuthority) ||
    !validAuthority(info.freezeAuthority) ||
    !/^\d+$/.test(supply.value.amount) ||
    supply.value.amount !== info.supply ||
    supply.value.decimals !== info.decimals ||
    typeof supply.value.uiAmountString !== "string"
  ) {
    throw new Error("Solana returned an invalid GTREE mint account.");
  }

  const maximumSupplyUi = PROJECT.maxSupply.toString();
  return {
    network: "solana-mainnet",
    mint: ENV.gtreeMint,
    name: PROJECT.name,
    symbol: PROJECT.token,
    tokenProgram: value.owner,
    standard: PROJECT.tokenStandard,
    decimals: info.decimals,
    supplyRaw: supply.value.amount,
    supplyUi: supply.value.uiAmountString,
    maximumSupplyUi,
    isInitialized: info.isInitialized,
    fixedSupplyVerified: info.mintAuthority === null && supply.value.uiAmountString === maximumSupplyUi,
    mintAuthority: {
      address: info.mintAuthority,
      status: info.mintAuthority === null ? "revoked" : "active",
    },
    freezeAuthority: {
      address: info.freezeAuthority,
      status: info.freezeAuthority === null ? "revoked" : "active",
    },
  };
}

const getVerifiedTokenState = unstable_cache(readVerifiedTokenState, ["gtree-token-state-v2"], {
  revalidate: 3_600,
  tags: ["gtree-token-state"],
});

export async function getTokenState(): Promise<DataResult<TokenState>> {
  try {
    return readyData(await getVerifiedTokenState(), "solana-rpc");
  } catch (error) {
    return unavailableData<TokenState>(
      "solana-rpc",
      error instanceof Error ? error.message : "Unable to verify the GTREE mint on Solana Mainnet.",
    );
  }
}
