import type { LucideIcon } from "lucide-react";
import { Landmark, Layers, ShoppingBag, Sprout, TreeDeciduous, Trophy } from "lucide-react";

export type ModuleLifecycle = "concept" | "planned" | "in-development";

export interface EcosystemModuleData {
  id: string;
  title: string;
  icon: LucideIcon;
  lifecycle: ModuleLifecycle;
  purpose: string;
  userValue: string;
  connection: string;
  moduleLinks: string;
}

export const ECOSYSTEM_MODULES: EcosystemModuleData[] = [
  {
    id: "digital-tree",
    title: "Digital Tree",
    icon: TreeDeciduous,
    lifecycle: "planned",
    purpose: "A persistent, growing digital identity that represents a community member's presence in the Green Tree ecosystem.",
    userValue: "A visible, evolving symbol of participation rather than a static profile picture.",
    connection: "Grows in response to verified GTREE holding and ecosystem participation, not price speculation.",
    moduleLinks: "Feeds Green Score and can later reflect Mission Participation and Governance activity.",
  },
  {
    id: "green-score",
    title: "Green Score",
    icon: Trophy,
    lifecycle: "planned",
    purpose: "A participation and reputation measure based on meaningful ecosystem activity over time.",
    userValue: "Recognition for genuine contribution instead of pure token balance.",
    connection: "Calculated from wallet activity, mission participation and community actions connected to GTREE.",
    moduleLinks: "Could influence future TreeDrop distribution and Governance weight.",
  },
  {
    id: "treedrop",
    title: "TreeDrop",
    icon: Sprout,
    lifecycle: "concept",
    purpose: "A future contribution-based reward and distribution system for active ecosystem participants.",
    userValue: "A way to be recognized for sustained, verifiable contribution rather than early speculation alone.",
    connection: "Would draw from designated allocation categories under the existing treasury-control structure.",
    moduleLinks: "Depends on Green Score and Mission Participation data to determine fair distribution.",
  },
  {
    id: "mission-participation",
    title: "Mission Participation",
    icon: Layers,
    lifecycle: "in-development",
    purpose: "A structured way for the community to interact with, follow, and support verified environmental missions.",
    userValue: "Direct visibility into mission progress and ways to contribute beyond funding alone.",
    connection: "Built on top of the existing mission verification and evidence pipeline described in the Environmental Mission Policy.",
    moduleLinks: "Primary input to Green Score; connects directly to the Missions directory.",
  },
  {
    id: "governance",
    title: "Governance",
    icon: Landmark,
    lifecycle: "concept",
    purpose: "A future framework for community participation in selected ecosystem decisions.",
    userValue: "A structured voice in the direction of future modules and programs.",
    connection: "Any governance module must be separately reviewed, versioned and published, and must not retroactively restrict existing GTREE transfer rights.",
    moduleLinks: "Would reference Green Score and wallet history as participation signals.",
  },
  {
    id: "marketplace",
    title: "Marketplace",
    icon: ShoppingBag,
    lifecycle: "concept",
    purpose: "A future ecosystem layer for relevant assets, participation perks, or utilities connected to Green Tree.",
    userValue: "A destination for ecosystem-native utility beyond simply holding the token.",
    connection: "Any marketplace listing would be denominated using the same open public-market pricing principles as GTREE itself.",
    moduleLinks: "Could interoperate with Digital Tree identity and Green Score standing.",
  },
];

export const LIFECYCLE_LABEL: Record<ModuleLifecycle, string> = {
  concept: "Concept",
  planned: "Planned",
  "in-development": "In development",
};
