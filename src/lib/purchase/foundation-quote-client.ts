import type { PurchasePolicy } from "@/lib/providers/market-provider";
import { decimalToAtomic } from "@/lib/market/amounts";

export const FOUNDATION_QUOTE_DEBOUNCE_MS = 400;
export const MATERIAL_QUOTE_CHANGE_BPS = 100;

export type FoundationTransactionState =
  | "IDLE"
  | "QUOTING"
  | "REVIEW"
  | "AWAITING_WALLET"
  | "SUBMITTED"
  | "CONFIRMING"
  | "CONFIRMED"
  | "FAILED"
  | "EXPIRED";

export type QuoteBlockReason =
  | "wallet"
  | "balance"
  | "amount"
  | "minimum"
  | "maximum"
  | "insufficient"
  | "paused"
  | "mode"
  | "transaction";

export function getFoundationQuoteBlockReason(input: {
  connected: boolean;
  balanceReady: boolean;
  inputRaw: string | null;
  spendableRaw: bigint | null;
  policy: PurchasePolicy | null;
  transactionState: FoundationTransactionState;
}): QuoteBlockReason | null {
  if (!input.connected) return "wallet";
  if (!input.balanceReady || input.spendableRaw === null) return "balance";
  if (!input.inputRaw || !/^[1-9]\d*$/.test(input.inputRaw)) return "amount";
  if (!input.policy) return "mode";
  if (input.policy.purchaseMode !== "FOUNDATION_DIRECT") return input.policy.purchaseMode === "PAUSED" ? "paused" : "mode";
  if (input.policy.emergencyPaused) return "paused";
  const amount = BigInt(input.inputRaw);
  if (amount < BigInt(input.policy.minPurchaseLamports)) return "minimum";
  if (amount > BigInt(input.policy.maxPurchaseLamports)) return "maximum";
  if (amount > input.spendableRaw) return "insufficient";
  if (["REVIEW", "AWAITING_WALLET", "SUBMITTED", "CONFIRMING", "CONFIRMED"].includes(input.transactionState)) {
    return "transaction";
  }
  return null;
}

export function provisionalOutputRaw(
  inputRaw: string,
  referenceInputRaw: string,
  referenceOutputRaw: string,
): string | null {
  if (!/^[1-9]\d*$/.test(inputRaw) || !/^[1-9]\d*$/.test(referenceInputRaw) || !/^[1-9]\d*$/.test(referenceOutputRaw)) {
    return null;
  }
  const output = (BigInt(referenceOutputRaw) * BigInt(inputRaw)) / BigInt(referenceInputRaw);
  return output > 0n ? output.toString() : null;
}

export function previewOutputFromMarketPrice(
  inputLamports: string,
  gtreePriceSol: string,
): string | null {
  if (!/^[1-9]\d*$/.test(inputLamports)) return null;
  try {
    const price = decimalToAtomic(gtreePriceSol, 18);
    const output = (BigInt(inputLamports) * 10n ** 18n) / BigInt(price.raw);
    return output > 0n ? output.toString() : null;
  } catch {
    return null;
  }
}

export function previewOutputFromEffectiveRate(
  inputLamports: string,
  effectiveGtreePerSol: string,
): string | null {
  if (!/^[1-9]\d*$/.test(inputLamports)) return null;
  try {
    const rate = decimalToAtomic(effectiveGtreePerSol, 18);
    const output = (BigInt(inputLamports) * BigInt(rate.raw)) / 10n ** 18n;
    return output > 0n ? output.toString() : null;
  } catch {
    return null;
  }
}

export function quoteChangeBps(previewOutputRaw: string, quotedOutputRaw: string): bigint | null {
  if (!/^[1-9]\d*$/.test(previewOutputRaw) || !/^[1-9]\d*$/.test(quotedOutputRaw)) return null;
  const preview = BigInt(previewOutputRaw);
  const quote = BigInt(quotedOutputRaw);
  const difference = preview > quote ? preview - quote : quote - preview;
  return (difference * 10_000n) / preview;
}

export function isMaterialQuoteChange(
  previewOutputRaw: string,
  quotedOutputRaw: string,
  thresholdBps = MATERIAL_QUOTE_CHANGE_BPS,
) {
  const change = quoteChangeBps(previewOutputRaw, quotedOutputRaw);
  return change !== null && change >= BigInt(thresholdBps);
}

type RequestHandlers<T> = {
  success(value: T): void;
  error(error: unknown): void;
  settled(): void;
};

export class LatestQuoteRequest<T> {
  private generation = 0;
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  get inFlight() {
    return this.controller !== null;
  }

  schedule(
    delayMs: number,
    request: (signal: AbortSignal) => Promise<T>,
    handlers: RequestHandlers<T>,
  ) {
    this.cancel();
    const generation = this.generation;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run(generation, request, handlers);
    }, delayMs);
  }

  start(request: (signal: AbortSignal) => Promise<T>, handlers: RequestHandlers<T>) {
    this.cancel();
    void this.run(this.generation, request, handlers);
  }

  startIfIdle(request: (signal: AbortSignal) => Promise<T>, handlers: RequestHandlers<T>) {
    if (this.inFlight) return false;
    this.start(request, handlers);
    return true;
  }

  cancel() {
    this.generation += 1;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.controller?.abort();
    this.controller = null;
  }

  private async run(
    generation: number,
    request: (signal: AbortSignal) => Promise<T>,
    handlers: RequestHandlers<T>,
  ) {
    if (generation !== this.generation) return;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const result = await request(controller.signal);
      if (generation === this.generation && !controller.signal.aborted) handlers.success(result);
    } catch (error) {
      if (generation === this.generation && !controller.signal.aborted) handlers.error(error);
    } finally {
      if (generation === this.generation) {
        this.controller = null;
        handlers.settled();
      }
    }
  }
}
