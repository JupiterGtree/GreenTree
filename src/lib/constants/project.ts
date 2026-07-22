/**
 * Verified Green Tree Version 2.0.0 project facts.
 * Source: /docs (WHITEPAPER, CONSTITUTION, MANIFEST, TOKEN_MARKET_POLICY,
 * LIQUIDITY_POLICY, ENVIRONMENTAL_MISSION_POLICY, TRANSPARENCY_AND_REPORTING_POLICY,
 * OFFICIAL_LINKS, CHANGELOG). Treat this file as the single source of static truth.
 */

export const PROJECT = {
  name: "Green Tree",
  token: "GTREE",
  tagline: "Grow Together.",
  network: "Solana Mainnet",
  tokenStandard: "Classic SPL Token",
  decimals: 9,
  maxSupply: 1_000_000_000,
  mint: "AYJ2xXLxNrcJfx7ycgZA6FQnpTSoipdRcCvJPLMadpuJ",
  website: "https://gtree.land",
  metadataUrl: "https://gtree.land/assets/token/metadata.json",
  imageUrl: "https://gtree.land/assets/token/green-tree-token-logo.png",
  officialX: "https://x.com/GreenTreedHQ",
  officialXHandle: "@GreenTreedHQ",
  telegram: "https://t.me/Gttofficial",
  telegramHandle: "@Gttofficial",
  telegramConfirmed: true,
  contacts: {
    support: "support@gtree.land",
    hello: "hello@gtree.land",
    partnerships: "partnerships@gtree.land",
    media: "media@gtree.land",
    legal: "legal@gtree.land",
    security: "security@gtree.land",
    notifications: "no-reply@gtree.land",
  },
  docVersion: "2.0.0",
  docPublicationDate: "2026-07-14",
} as const;

export const TREASURY = {
  squadsProgram: "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
  multisig: "9q5h51uR7ePgdwFyTUpuF98yREdkBM2MX5yk74a74JfR",
  vault: "AZzDWNJQWuvwxwCDXhdHNAnj9dgFXMbD6NMQG851hyY7",
  threshold: "2-of-2",
  members: [
    { label: "Founder member 1", address: "BwDQaHc6NTUtbaesL6SERjhLggrAkTmPFYBSrsYW3qcZ" },
    { label: "Founder member 2", address: "DwV3RocJcWn9DxYs5Mb88PPHjQFfzb4Khyjn5mFZFrBF" },
  ],
} as const;

export const ALLOCATION = [
  {
    id: "public",
    label: "Public Distribution",
    pct: 12,
    description: "Freely transferable supply available through the open market.",
  },
  {
    id: "seasonal",
    label: "Seasonal Growth Fund",
    pct: 3,
    description: "Reserved for time-boxed community growth initiatives.",
  },
  {
    id: "community",
    label: "Community Pool",
    pct: 15,
    description: "Directed toward community programs and participation rewards.",
  },
  {
    id: "liquidity",
    label: "Liquidity",
    pct: 15,
    description: "Reserved to support open-market liquidity depth over time.",
  },
  {
    id: "treasury",
    label: "Treasury",
    pct: 15,
    description: "Held under the Squads 2-of-2 multisig treasury structure.",
  },
  {
    id: "core",
    label: "Core Contributors",
    pct: 10,
    description: "Allocated to the individuals building Green Tree.",
  },
  {
    id: "marketing",
    label: "Marketing and Partnerships",
    pct: 10,
    description: "Supports ecosystem visibility and partner collaboration.",
  },
  {
    id: "ecosystem",
    label: "Ecosystem Growth Fund",
    pct: 10,
    description: "Reserved for future ecosystem modules and integrations.",
  },
  {
    id: "reserve",
    label: "Strategic Reserve",
    pct: 10,
    description: "A long-term reserve for unforeseen strategic needs.",
  },
] as const;

export const LIQUIDITY_THRESHOLDS = [
  { proceedsUsd: 50_000, targetCumulativePct: 18 },
  { proceedsUsd: 100_000, targetCumulativePct: 22 },
  { proceedsUsd: 200_000, targetCumulativePct: 32 },
] as const;

export const NAV_LINKS = [
  { label: "Market", href: "/market" },
  { label: "Transparency", href: "/transparency" },
  { label: "Missions", href: "/missions" },
  { label: "Ecosystem", href: "/ecosystem" },
  { label: "Roadmap", href: "/roadmap" },
  { label: "News & Updates", href: "/news" },
  { label: "Docs", href: "/docs" },
  { label: "Contact", href: "/contact" },
] as const;

export const RISK_NOTICE =
  "GTREE participation involves market, liquidity and execution risk. Price can rise or fall, quotes expire, and slippage may be material. Green Tree does not guarantee price appreciation, a price floor, a buyback, or permanent liquidity.";

export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}\u2026${address.slice(-chars)}`;
}

export function explorerAddressUrl(base: string, address: string): string {
  return `${base.replace(/\/$/, "")}/account/${address}`;
}

export function explorerTxUrl(base: string, signature: string): string {
  return `${base.replace(/\/$/, "")}/tx/${signature}`;
}
