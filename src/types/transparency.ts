export type RecordSourceType = "policy" | "on-chain" | "report";

export type TransparencyCategory =
  | "token-identity"
  | "authorities"
  | "treasury"
  | "liquidity"
  | "missions"
  | "policy-changes"
  | "security";

export type VerificationLevel =
  | "verified-on-chain"
  | "documented-policy"
  | "project-report"
  | "pending-verification";

export interface TransparencyRecord {
  id: string;
  category: TransparencyCategory;
  sourceType: RecordSourceType;
  title: string;
  description: string;
  amountUsd?: number;
  timestamp: string;
  verification: VerificationLevel;
  signature?: string;
  documentSlug?: string;
  addresses?: { label: string; address: string }[];
}

export interface TreasuryMember {
  label: string;
  address: string;
}

export interface TreasuryControl {
  program: string;
  multisig: string;
  vault: string;
  threshold: string;
  members: TreasuryMember[];
}

export interface OfficialDocument {
  slug: string;
  title: string;
  version: string;
  description: string;
  format: "Markdown" | "PDF" | "DOCX";
  updatedAt: string;
  category: "Policy" | "Governance" | "Reference";
  path: string;
  verifiedOfficial: boolean;
}
