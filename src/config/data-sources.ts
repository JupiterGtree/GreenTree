export type DataSourceKey =
  | "solana-rpc"
  | "jupiter-swap"
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
  "jupiter-swap": {
    name: "Jupiter Swap API",
    purpose: "SOL-to-GTREE route quotes and user-signed swap transaction construction",
    endpointType: "REST",
    network: "Solana Mainnet",
    authoritativeStatus: "Official Jupiter API; Metis v1 is legacy and requires a planned Swap V2 migration",
    expectedRefreshIntervalMs: 15_000,
    timeoutMs: 8_000,
    fallbackPolicy: "No quote and no swap preparation; never create a synthetic route",
    environmentVariable: "JUPITER_API_BASE_URL",
    documentationUrl: "https://dev.jup.ag/docs/swap/v1/get-quote",
  },
  "meteora-pool": {
    name: "Meteora DAMM v2 pool data",
    purpose: "Confirmed pool identity, reserves, spot price, SOL conversion, TVL, volume and OHLCV",
    endpointType: "REST",
    network: "Solana Mainnet",
    authoritativeStatus: "Official Meteora DAMM v2 public data API",
    expectedRefreshIntervalMs: 15_000,
    timeoutMs: 8_000,
    fallbackPolicy: "Return unavailable; zero is accepted only when the field is present and validated",
    environmentVariable: "METEORA_POOL_API_URL",
    documentationUrl: "https://docs.meteora.ag/api-reference/damm-v2/pools/pool",
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
