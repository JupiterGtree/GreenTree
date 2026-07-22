export type MissionStatus =
  | "proposed"
  | "under-review"
  | "approved"
  | "in-progress"
  | "partially-completed"
  | "completed"
  | "delayed"
  | "suspended"
  | "cancelled"
  | "failed";

export type MissionCategory =
  | "reforestation"
  | "ecosystem-restoration"
  | "biodiversity-protection"
  | "waste-removal"
  | "water-protection"
  | "habitat-support"
  | "environmental-education";

export interface MissionMilestone {
  id: string;
  label: string;
  amountUsd: number;
  status: "pending" | "paid" | "skipped";
  date?: string;
  signature?: string;
}

export interface MissionEvidenceItem {
  id: string;
  kind: "photo" | "document" | "permit" | "receipt" | "geolocation" | "video";
  title: string;
  note: string;
}

export interface Mission {
  slug: string;
  title: string;
  isExample: boolean;
  location: string;
  category: MissionCategory;
  status: MissionStatus;
  objective: string;
  problem: string;
  executor: string;
  verified: boolean;
  approvedBudgetUsd: number;
  paidUsd: number;
  completionPct: number;
  measurableTarget: string;
  measurableProgress: string;
  timelineStart: string;
  timelineEnd: string;
  evidenceCount: number;
  milestones: MissionMilestone[];
  evidence: MissionEvidenceItem[];
  outcomeReport?: string;
  verificationNotes?: string;
}
