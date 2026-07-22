import type {
  ChartQuote,
  ChartRange,
  DataMode,
  PriceHistory,
  QuoteResult,
} from "@/types/market";

export interface MarketProvider {
  mode: DataMode;
  getPriceHistory(quote: ChartQuote, range: ChartRange, snapshotId?: string): Promise<PriceHistory>;
  getPurchasePolicy(signal?: AbortSignal): Promise<PurchasePolicy>;
  getQuote(inputSol: string, slippageBps: number, signal?: AbortSignal, wallet?: string | null): Promise<QuoteResult>;
}

export interface PurchasePolicy {
  purchaseMode: "FOUNDATION_DIRECT" | "MARKET" | "PAUSED";
  emergencyPaused: boolean;
  minPurchaseLamports: string;
  maxPurchaseLamports: string;
  automaticQuoteRefreshIntervalMs: number;
}

export class QuoteRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status: number,
  ) {
    super(message);
    this.name = "QuoteRequestError";
  }
}

function assertOk(response: Response, fallback: string): Promise<Response> {
  if (response.ok) return Promise.resolve(response);
  return response.json().catch(() => null).then((payload) => {
    const message = payload && typeof payload.error === "string" ? payload.error : fallback;
    const retryable = Boolean(payload && payload.retryable === true) || response.status === 503;
    throw new QuoteRequestError(message, retryable, response.status);
  });
}

class LiveMarketProvider implements MarketProvider {
  mode: DataMode = "live";

  async getPriceHistory(quote: ChartQuote, range: ChartRange, snapshotId?: string): Promise<PriceHistory> {
    const params = new URLSearchParams({ quote, range });
    if (snapshotId) params.set("snapshotId", snapshotId);
    const response = await fetch(`/api/market/history?${params}`);
    await assertOk(response, "Live price history is unavailable.");
    return response.json() as Promise<PriceHistory>;
  }

  async getPurchasePolicy(signal?: AbortSignal): Promise<PurchasePolicy> {
    const response = await fetch("/api/purchase/mode", { cache: "no-store", signal });
    await assertOk(response, "Purchase mode is unavailable.");
    return response.json() as Promise<PurchasePolicy>;
  }

  async getQuote(inputSol: string, slippageBps: number, signal?: AbortSignal, wallet?: string | null): Promise<QuoteResult> {
    if (!wallet) throw new Error("Connect your wallet to request a Foundation quote.");
    const params = new URLSearchParams({ inputSol, slippageBps: String(slippageBps) });
    params.set("wallet", wallet);
    const response = await fetch(`/api/foundation/quote?${params}`, { cache: "no-store", signal });
    await assertOk(response, "No live GTREE quote is available.");
    return response.json() as Promise<QuoteResult>;
  }

}

const provider = new LiveMarketProvider();

export function getMarketProvider(): MarketProvider {
  return provider;
}
