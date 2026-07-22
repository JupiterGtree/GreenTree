import "server-only";

import { unstable_cache } from "next/cache";
import { getTokenState } from "@/data/token/get-token-state";
import { PROJECT } from "@/lib/constants/project";
import type { DataResult } from "@/types/data";
import type { TransparencyRecord } from "@/types/transparency";

const PUBLICATION_TIMESTAMP = `${PROJECT.docPublicationDate}T00:00:00.000Z`;

const OFFICIAL_POLICY_RECORDS: TransparencyRecord[] = [
  {
    id: "policy-token-market-v2",
    category: "token-identity",
    sourceType: "policy",
    title: "Token and market policy · version 2.0.0",
    description: "The official policy defines GTREE as a freely transferable Classic SPL token with public-market pricing only.",
    timestamp: PUBLICATION_TIMESTAMP,
    verification: "documented-policy",
    documentSlug: "token-market-policy",
    addresses: [{ label: "Mint", address: PROJECT.mint }],
  },
  {
    id: "policy-liquidity-v2",
    category: "liquidity",
    sourceType: "policy",
    title: "Liquidity policy · version 2.0.0",
    description: "Published thresholds are policy targets. No cumulative proceeds or executed contribution is shown without a verified record.",
    timestamp: PUBLICATION_TIMESTAMP,
    verification: "documented-policy",
    documentSlug: "liquidity-policy",
  },
  {
    id: "policy-transparency-v2",
    category: "policy-changes",
    sourceType: "policy",
    title: "Transparency and reporting policy · version 2.0.0",
    description: "The official reporting policy separates project-published statements from independently verifiable on-chain records.",
    timestamp: PUBLICATION_TIMESTAMP,
    verification: "documented-policy",
    documentSlug: "transparency-reporting-policy",
  },
];

async function readTransparencyRecords(): Promise<DataResult<TransparencyRecord[]>> {
  const token = await getTokenState();
  const records = [...OFFICIAL_POLICY_RECORDS];

  if (token.data && token.fetchedAt) {
    records.unshift(
      {
        id: `chain-token-state-${token.fetchedAt}`,
        category: "token-identity",
        sourceType: "on-chain",
        title: "GTREE mint state verified on Solana Mainnet",
        description: `${token.data.standard}, ${token.data.decimals} decimals, ${token.data.supplyUi} GTREE current supply.`,
        timestamp: token.fetchedAt,
        verification: "verified-on-chain",
        addresses: [{ label: "Mint", address: token.data.mint }],
      },
      {
        id: `chain-mint-authority-${token.fetchedAt}`,
        category: "authorities",
        sourceType: "on-chain",
        title: "Mint Authority verified",
        description: token.data.mintAuthority.status === "revoked"
          ? "The parsed mint account reports no Mint Authority."
          : `The parsed mint account reports Mint Authority ${token.data.mintAuthority.address}.`,
        timestamp: token.fetchedAt,
        verification: "verified-on-chain",
        addresses: [{ label: "Mint", address: token.data.mint }],
      },
      {
        id: `chain-freeze-authority-${token.fetchedAt}`,
        category: "authorities",
        sourceType: "on-chain",
        title: "Freeze Authority verified",
        description: token.data.freezeAuthority.status === "revoked"
          ? "The parsed mint account reports no Freeze Authority."
          : `The parsed mint account reports Freeze Authority ${token.data.freezeAuthority.address}.`,
        timestamp: token.fetchedAt,
        verification: "verified-on-chain",
        addresses: [{ label: "Mint", address: token.data.mint }],
      },
    );
  }

  return {
    data: records,
    source: token.data ? "solana-rpc" : "green-tree-documents",
    fetchedAt: token.fetchedAt ?? PUBLICATION_TIMESTAMP,
    status: token.data ? "ready" : "stale",
    stale: !token.data,
    error: token.data ? null : token.error,
    network: token.data ? "solana-mainnet" : "project-static",
  };
}

export const getTransparencyRecords = unstable_cache(readTransparencyRecords, ["gtree-transparency-records-v1"], {
  revalidate: 3600,
  tags: ["gtree-transparency-records"],
});
