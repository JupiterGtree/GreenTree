import type { TransparencyCategory } from "@/types/transparency";

export const CATEGORY_LABELS: Record<TransparencyCategory, string> = {
  "token-identity": "Token identity",
  authorities: "Authorities",
  treasury: "Treasury",
  liquidity: "Liquidity",
  missions: "Missions",
  "policy-changes": "Policy changes",
  security: "Security",
};

export const SOURCE_TYPE_LABELS = {
  policy: "Policy",
  "on-chain": "On-chain record",
  report: "Project report",
} as const;
