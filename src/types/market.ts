export type DataMode = "live" | "demo";

export type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "unavailable"; reason: string }
  | { status: "ready"; data: T; mode: DataMode };

export interface MarketSnapshot {
  snapshotId: string;
  gtreeUsd: number;
  solUsd: number;
  gtreePerSol: string;
  priceUsd: number;
  priceSol: number;
  solPriceUsd: number;
  referenceGtreePerSol: string;
  effectiveGtreePerSol: string;
  priceAdjustmentBps: number;
  fetchedAt: string;
  sourceTimestamp?: string | null;
  expiresAt: string;
  sourceStatus: "LIVE" | "STALE" | "UNAVAILABLE";
  change24hPct: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  liquiditySource: "Meteora TVL" | "Reserve-derived estimate";
  volume24hUsd: number | null;
  holders: number | null;
  updatedAt: string;
  source: string;
  poolAddress: string;
  poolUrl: string;
  dex: string;
  pairName: string;
  buys24h: number | null;
  sells24h: number | null;
  fee24hUsd: number | null;
  isBlacklisted: boolean | null;
}

export interface FoundationInventorySnapshot {
  totalAllocationBaseUnits: string;
  totalAllocationGtree: string;
  accountBalanceBaseUnits: string;
  accountBalanceGtree: string;
  delegatedAllowanceBaseUnits: string | null;
  delegatedAllowanceGtree: string | null;
  delegateActive: boolean;
  spendableBaseUnits: string;
  spendableGtree: string;
  tokenDecimals: number;
  mint: string;
  saleTokenAccount: string;
  fetchedAt: string;
  status: "LIVE" | "STALE" | "UNAVAILABLE";
}

export type ChartQuote = "USD" | "SOL";
export type ChartRange = "1H" | "24H" | "7D" | "30D";

export interface PricePoint {
  timestamp: number;
  price: number;
  volume: number;
}

export interface PriceHistory {
  snapshotId: string;
  fetchedAt: string;
  expiresAt: string;
  sourceStatus: MarketSnapshot["sourceStatus"];
  quote: ChartQuote;
  range: ChartRange;
  points: PricePoint[];
  changePct: number | null;
  spotPrice?: number;
  venue?: string;
  router?: string;
  poolAddress?: string;
  poolUrl?: string;
  availableFrom?: number | null;
  lastTradeAt?: number | null;
}

export interface QuoteRequest {
  inputSol: string;
  slippageBps: number;
}

export interface WebsiteBonusQuote {
  bonusGtree: string;
  bonusBps: number;
  totalExpectedGtree: string;
  source: "Green Tree bonus service";
  verifiedAt: string;
}

export interface MarketQuoteResult {
  mode: "MARKET";
  inputSol: string;
  inputAmountRaw: string;
  outputGtree: string;
  outputAmountRaw: string;
  gtreePriceUsd: number | null;
  solPriceUsd: number | null;
  inputUsd: number | null;
  outputUsd: number | null;
  quoteLossUsd: number | null;
  quoteLossPct: number | null;
  priceImpactPct: number;
  slippageBps: number;
  minimumReceivedGtree: string;
  minimumReceivedRaw: string;
  networkFeeSol: string | null;
  route: string;
  routePlan: Array<{ label: string; poolAddress: string; percent: number }>;
  expiresAt: number;
  quoteId: string;
  poolAddress: string;
  source: "Jupiter";
  fetchedAt: string;
  network: "solana-mainnet";
  inputMint: string;
  outputMint: string;
  websiteBonus: WebsiteBonusQuote | null;
}

export interface FoundationDirectQuoteResult {
  mode: "FOUNDATION_DIRECT";
  inputSol: string;
  inputAmountRaw: string;
  inputLamports: string;
  outputGtree: string;
  outputAmountRaw: string;
  outputTokenUnits: string;
  referenceGtreePriceUsd: number | null;
  referenceSolPriceUsd: number | null;
  gtreePriceUsd: number | null;
  solPriceUsd: number | null;
  inputUsd: number | null;
  outputUsd: number | null;
  quoteLossUsd: null;
  quoteLossPct: null;
  gtreePerSol: string;
  availableFoundationInventory: string;
  availableFoundationInventoryGtree: string;
  maximumAllowedPurchaseLamports: string;
  maximumAllowedPurchaseSol: string;
  maximumAllowedPurchaseTokenUnits: string;
  maximumAllowedPurchaseGtree: string;
  treasuryRecipient: string;
  quoteToken?: string;
  networkFeeSol: string | null;
  route: "Foundation inventory";
  routePlan: [];
  expiresAt: number;
  quoteId: string;
  source: "Green Tree Foundation reference price";
  fetchedAt: string;
  network: "solana-mainnet";
  inputMint: string;
  outputMint: string;
  poolAddress: null;
  websiteBonus: WebsiteBonusQuote | null;
}

export type QuoteResult = MarketQuoteResult | FoundationDirectQuoteResult;

export interface PreparedSwap {
  transaction: string;
  lastValidBlockHeight: number | null;
  prioritizationFeeLamports: number | null;
}

export type WalletConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "wrong-network"
  | "signature-requested"
  | "rejected"
  | "disconnected-unexpectedly";

export type BuyWidgetState =
  | "connect-wallet"
  | "input"
  | "review"
  | "pending"
  | "success"
  | "rejected"
  | "expired-quote"
  | "insufficient-balance"
  | "unavailable-route";

export interface WalletInfo {
  id: string;
  name: string;
  icon: "phantom" | "solflare";
  installed: boolean;
}

export interface ConnectedWallet {
  address: string;
  solBalance: number;
  solBalanceLamports: string;
  gtreeBalance: number;
  gtreeBalanceRaw: string;
}

export interface LiquidityThreshold {
  proceedsUsd: number;
  targetCumulativePct: number;
}

export interface LiquidityAction {
  id: string;
  thresholdUsd: number;
  targetCumulativePct: number;
  amountAddedUsd: number;
  assets: string;
  route: string;
  signature: string;
  executedAt: string;
}

export interface LiquidityState {
  cumulativeProceedsUsd: number | null;
  thresholds: LiquidityThreshold[];
  actions: LiquidityAction[];
}

export interface AllocationCategory {
  id: string;
  label: string;
  pct: number;
  amount: number;
  description: string;
}

export type AuthorityStatusValue =
  | "verified"
  | "revoked"
  | "not-retained"
  | "multisig-controlled"
  | "public-market"
  | "unrestricted"
  | "unavailable"
  | "documented-policy";

export interface AuthorityFact {
  id: string;
  label: string;
  status: AuthorityStatusValue;
  explanation: string;
}

export interface SolanaNetworkStatus {
  network: "mainnet-beta";
  operational: boolean;
  label: string;
}
