export type RoadmapStatus = "completed" | "active" | "next" | "planned" | "research";

export interface RoadmapPhaseData {
  id: string;
  phase: string;
  title: string;
  status: RoadmapStatus;
  summary: string;
  items: string[];
}

export const ROADMAP_PHASES: RoadmapPhaseData[] = [
  {
    id: "phase-1",
    phase: "Phase 1",
    title: "Foundation and public market",
    status: "completed",
    summary: "The base token, network identity and open market access that everything else builds on.",
    items: [
      "GTREE identity finalized",
      "Solana Mainnet token live",
      "Open transfer from launch",
      "Public-market pricing",
      "Official website",
      "Treasury structure established",
      "Initial liquidity route",
    ],
  },
  {
    id: "phase-2",
    phase: "Phase 2",
    title: "Transparency infrastructure",
    status: "active",
    summary: "Public infrastructure that makes project activity independently checkable.",
    items: [
      "Transaction records",
      "Allocation reporting",
      "Authority records",
      "Liquidity reporting",
      "Official document center",
    ],
  },
  {
    id: "phase-3",
    phase: "Phase 3",
    title: "Environmental mission system",
    status: "next",
    summary: "The full pipeline for proposing, funding, executing and reporting environmental missions.",
    items: [
      "Mission submission",
      "Executor review",
      "Budgets",
      "Evidence",
      "Milestone payments",
      "Final reports",
    ],
  },
  {
    id: "phase-4",
    phase: "Phase 4",
    title: "Community identity",
    status: "planned",
    summary: "Persistent identity and contribution history for ecosystem participants.",
    items: ["Digital Tree", "Green Score", "Contribution history", "User profiles"],
  },
  {
    id: "phase-5",
    phase: "Phase 5",
    title: "Participation systems",
    status: "research",
    summary: "Deeper participation mechanisms that build on identity and mission infrastructure.",
    items: ["TreeDrop", "Mission participation", "Governance", "Marketplace concepts"],
  },
];

export const ROADMAP_STATUS_LABEL: Record<RoadmapStatus, string> = {
  completed: "Completed",
  active: "Active",
  next: "Next",
  planned: "Planned",
  research: "Research",
};
