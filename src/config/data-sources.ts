export type DataSourceKey =
  | "solana-rpc"
  | "jupiter-swap"
  | "external-market"
  | "meteora-pool"
  | "green-tree-documents";

export interface DataSourceDefinition {
  name: string;
  purpose: string;
  endpointType: "JSON-RPC" | "REST" | "Bundled official documents";
  network: "Solana Mainnet" | "Project static";
  authoritativeStatus: string;
  expectedRefreshIntervalMs: number;
  timeoutMs: number;
  fallbackPolicy: string;
  environmentVariable: string | null;
  documentationUrl: string;
}

export const DATA_SOURCES: Record<DataSourceKey, DataSourceDefinition> = {
  "solana-rpc": {
    name: "Solana Mainnet RPC",
    purpose: "Mint state, token supply, account balances, signatures and parsed transactions",
    endpointType: "JSON-RPC",
    network: "Solana Mainnet",
    authoritativeStatus: "Primary on-chain source",
    expectedRefreshIntervalMs: 45_000,
    timeoutMs: 8_000,
    fallbackPolicy: "Return an unavailable or stale state; never substitute static on-chain values",
    environmentVariable: "SOLANA_RPC_URL",
    documentationUrl: "https://solana.com/docs/rpc",
  },
  "external-market": {
    name: "External market link",
    purpose: "Reference-only external market visibility; website purchases do not route through a DEX",
    endpointType: "REST",
    network: "Solana Mainnet",
    authoritativeStatus: "Not used for website purchase execution",
    expectedRefreshIntervalMs: 15_000,
    timeoutMs: 8_000,
    fallbackPolicy: "No external market execution fallback for website purchases",
    environmentVariable: null,
    documentationUrl: "https://www.geckoterminal.com/solana/pools/4EfPeDK4XEfpBXDsu6NwHTaGqh3CzPPT6jCemU5FeWJE",
  },
  "jupiter-swap": {
    name: "Legacy Jupiter API",
    purpose: "Legacy external market route support only; not used for Green Tree website purchases",
    endpointType: "REST",
    network: "Solana Mainnet",
    authoritativeStatus: "Disabled for Foundation Direct website purchase execution",
    expectedRefreshIntervalMs: 15_000,
    timeoutMs: 8_000,
    fallbackPolicy: "No website purchase execution fallback through Jupiter",
    environmentVariable: "JUPITER_API_BASE_URL",
    documentationUrl: "https://dev.jup.ag/docs/swap",
  },
  "meteora-pool": {
    name: "Meteora DAMM v2 snapshot via GeckoTerminal",
    purpose: "Reference-only GTREE/SOL market price used by Foundation Direct quotes and charts",
    endpointType: "REST",
    network: "Solana Mainnet",
    authoritativeStatus: "Official GeckoTerminal API for the confirmed Meteora DAMM v2 pool",
    expectedRefreshIntervalMs: 60_000,
    timeoutMs: 8_000,
    fallbackPolicy: "Use a sufficiently recent cached reference only after retry; otherwise stop purchases",
    environmentVariable: "GECKOTERMINAL_POOL_API_URL",
    documentationUrl: "https://api.geckoterminal.com/api/v2/networks/solana/pools/4EfPeDK4XEfpBXDsu6NwHTaGqh3CzPPT6jCemU5FeWJE",
  },
  "green-tree-documents": {
    name: "Green Tree official document pack",
    purpose: "Project identity, policies, roadmap commitments, treasury addresses and public contacts",
    endpointType: "Bundled official documents",
    network: "Project static",
    authoritativeStatus: "Owner-published official project source",
    expectedRefreshIntervalMs: 86_400_000,
    timeoutMs: 0,
    fallbackPolicy: "Build-time failure when a required document is missing; no invented replacement content",
    environmentVariable: null,
    documentationUrl: "/docs",
  },
};
