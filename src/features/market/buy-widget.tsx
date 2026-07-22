/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Radio,
  RotateCcw,
  Wallet as WalletIcon,
  XCircle,
} from "lucide-react";
import { VersionedTransaction } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuoteSummary } from "@/features/market/quote-summary";
import { useWallet } from "@/features/wallet/wallet-context";
import { getMarketProvider, QuoteRequestError, type PurchasePolicy } from "@/lib/providers/market-provider";
import {
  getFoundationQuoteBlockReason,
  isMaterialQuoteChange,
  LatestQuoteRequest,
  type FoundationTransactionState,
} from "@/lib/purchase/foundation-quote-client";
import type { PreparedSwap, QuoteResult } from "@/types/market";
import { formatSol, formatUsd } from "@/lib/formatters/number";
import { ENV, WRAPPED_SOL_MINT } from "@/lib/constants/env";
import {
  atomicToDecimal,
  formatDecimalAmount,
  fractionOfAtomic,
  normalizeDecimalInput,
} from "@/lib/market/amounts";
import {
  formatDistributionPercent,
  validateBuyInput,
} from "@/lib/market/buy-input";
import {
  getPriceImpactSeverity,
  isWebsitePurchaseBlocked,
  spendableLamports,
} from "@/lib/market/quote-safety";
import { projectFoundationRemaining } from "@/lib/purchase/foundation-inventory";
import {
  useSharedFoundationInventory,
  useSharedMarketSnapshot,
} from "@/lib/market/shared-client-snapshots";
import { cn } from "@/lib/utils";
import {
  isMarketSnapshotExpired,
  isMarketSnapshotPreviewable,
  isMarketSnapshotReviewable,
} from "@/lib/market/price-snapshot";

const SOL_DECIMALS = 9;
const SLIPPAGE_OPTIONS = [50, 100, 200];
type FlowStep = "form" | "review" | "pending" | "success" | "rejected";

function decodeTransaction(value: string) {
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  return VersionedTransaction.deserialize(bytes);
}

function validateQuoteForRequest(quote: QuoteResult, normalizedInput: string, inputRaw: string, slippageBps: number) {
  const positiveRaw = (value: string) => /^[1-9]\d*$/.test(value);
  if (
    quote.inputSol !== normalizedInput ||
    quote.inputAmountRaw !== inputRaw ||
    quote.inputMint !== WRAPPED_SOL_MINT ||
    quote.outputMint !== ENV.gtreeMint ||
    quote.network !== "solana-mainnet" ||
    !positiveRaw(quote.outputAmountRaw) ||
    quote.expiresAt <= Date.now()
  ) {
    throw new Error("Unable to verify this quote.");
  }

  if (quote.mode === "MARKET") {
    if (
      quote.slippageBps !== slippageBps ||
      !positiveRaw(quote.minimumReceivedRaw) ||
      !Array.isArray(quote.routePlan) ||
      quote.routePlan.length === 0 ||
      !Number.isFinite(quote.priceImpactPct) ||
      quote.priceImpactPct < 0 ||
      quote.priceImpactPct > 100
    ) {
      throw new Error("Unable to verify this market quote.");
    }
    return;
  }

  if (
    quote.mode !== "FOUNDATION_DIRECT" ||
    !quote.quoteToken ||
    quote.outputTokenUnits !== quote.outputAmountRaw ||
    !positiveRaw(quote.outputTokenUnits) ||
    !positiveRaw(quote.availableFoundationInventory) ||
    BigInt(quote.availableFoundationInventory) < BigInt(quote.outputTokenUnits)
  ) {
    throw new Error("Unable to verify this Foundation quote.");
  }
}

function PurchaseState({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-4 text-center">
      {icon}
      <div>
        <p className="font-semibold text-gt-fg">{title}</p>
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-gt-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function BuyWidget({ riskNotice }: { riskNotice: string }) {
  const {
    state: walletState,
    wallet,
    balanceStatus,
    balanceError,
    openDialog,
    signTransaction,
    signAndSendTransaction,
  } = useWallet();
  const connected = walletState === "connected" && Boolean(wallet);
  const walletAddress = wallet?.address ?? null;
  const [solInput, setSolInput] = React.useState("0.01");
  const [slippageBps, setSlippageBps] = React.useState(100);
  const [quote, setQuote] = React.useState<QuoteResult | null>(null);
  const [quoteExpired, setQuoteExpired] = React.useState(false);
  const [loadingQuote, setLoadingQuote] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [retryableQuoteError, setRetryableQuoteError] = React.useState(false);
  const [signature, setSignature] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<FlowStep>("form");
  const [highImpactConfirmed, setHighImpactConfirmed] = React.useState(false);
  const [foundationStep, setFoundationStep] = React.useState<FoundationTransactionState>("IDLE");
  const [remainingSec, setRemainingSec] = React.useState(0);
  const [purchasePolicy, setPurchasePolicy] = React.useState<PurchasePolicy | null>(null);
  const [materialQuoteChange, setMaterialQuoteChange] = React.useState(false);
  const quoteRequester = React.useRef(new LatestQuoteRequest<QuoteResult>());
  const foundationSubmitted = React.useRef(false);
  const marketSnapshotState = useSharedMarketSnapshot();
  const inventoryState = useSharedFoundationInventory();

  React.useEffect(() => {
    const controller = new AbortController();
    void getMarketProvider().getPurchasePolicy(controller.signal).then(setPurchasePolicy).catch((policyError) => {
      if (!controller.signal.aborted) {
        setError(policyError instanceof Error ? policyError.message : "Purchase mode is unavailable.");
      }
    });
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    if (!quote || quote.mode !== "FOUNDATION_DIRECT" || step !== "review" || foundationSubmitted.current) return;
    setFoundationStep("REVIEW");
    const interval = setInterval(() => {
      if (foundationSubmitted.current) {
        clearInterval(interval);
        return;
      }
      const sec = Math.ceil((quote.expiresAt - Date.now()) / 1000);
      if (sec <= 0) {
        setRemainingSec(0);
        setQuoteExpired(true);
        setFoundationStep("EXPIRED");
        setError("Price quote expired. Request a fresh quote before signing.");
        clearInterval(interval);
      } else {
        setRemainingSec(sec);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [quote, step]);

  const spendableRaw = connected && wallet && balanceStatus === "ready"
    ? spendableLamports(wallet.solBalanceLamports)
    : null;
  const marketSnapshot = marketSnapshotState.value?.data ?? null;
  const marketSnapshotReviewable = isMarketSnapshotReviewable(marketSnapshotState.value);
  const marketSnapshotPreviewable = isMarketSnapshotPreviewable(marketSnapshotState.value);
  const marketSnapshotExpired = Boolean(marketSnapshot && isMarketSnapshotExpired(marketSnapshot));
  const previewGtreePerSol = marketSnapshot
    ? purchasePolicy?.purchaseMode === "FOUNDATION_DIRECT"
      ? marketSnapshot.effectiveGtreePerSol
      : marketSnapshot.referenceGtreePerSol
    : null;
  const previewRate = previewGtreePerSol;
  const inventory = inventoryState.value;
  const previewInputValidation = React.useMemo(() => validateBuyInput(solInput, {
    effectiveGtreePerSol: marketSnapshotPreviewable ? previewGtreePerSol : null,
  }), [marketSnapshotPreviewable, previewGtreePerSol, solInput]);
  const inputValidation = React.useMemo(() => validateBuyInput(solInput, {
    maxPurchaseLamports: purchasePolicy?.maxPurchaseLamports,
    spendableLamports: spendableRaw,
    effectiveGtreePerSol: previewGtreePerSol,
    foundationInventoryBaseUnits:
      purchasePolicy?.purchaseMode === "FOUNDATION_DIRECT" ? inventory?.spendableBaseUnits : null,
  }), [
    inventory?.spendableBaseUnits,
    previewGtreePerSol,
    purchasePolicy?.maxPurchaseLamports,
    purchasePolicy?.purchaseMode,
    solInput,
    spendableRaw,
  ]);
  const inputAmount = inputValidation.amount;
  const previewInputAmount = previewInputValidation.valid ? previewInputValidation.amount : null;
  const insufficientBalance = inputValidation.code === "wallet";
  const quoteBlockReason = getFoundationQuoteBlockReason({
    connected,
    balanceReady: balanceStatus === "ready",
    inputRaw: inputAmount?.raw ?? null,
    spendableRaw,
    policy: purchasePolicy,
    transactionState: step === "review" ? "REVIEW" : foundationStep,
  });
  const quoteMatchesInput = Boolean(quote && inputAmount && quote.inputAmountRaw === inputAmount.raw);
  const marketQuote = quoteMatchesInput && quote?.mode === "MARKET" ? quote : null;
  const foundationQuote = quoteMatchesInput && quote?.mode === "FOUNDATION_DIRECT" ? quote : null;
  const previewRaw = previewInputValidation.valid ? previewInputValidation.previewRaw : null;
  const previewOutput = previewRaw ? atomicToDecimal(previewRaw, 9) : null;
  const projectedRemainingRaw = inventory
    ? projectFoundationRemaining(inventory.spendableBaseUnits, previewRaw)
    : null;
  const projectedRemaining = inventory && projectedRemainingRaw
    ? atomicToDecimal(projectedRemainingRaw, inventory.tokenDecimals)
    : null;
  const previewInputUsd = previewInputAmount && marketSnapshotPreviewable && marketSnapshot
    ? Number(previewInputAmount.normalized) * marketSnapshot.solUsd
    : null;
  const previewOutputUsd = previewOutput && marketSnapshotPreviewable && marketSnapshot
    ? Number(previewOutput) * marketSnapshot.gtreeUsd
    : null;
  const marketSnapshotStale = Boolean(
    marketSnapshot && (
      marketSnapshotState.error ||
      marketSnapshotState.value?.stale ||
      marketSnapshot.sourceStatus !== "LIVE" ||
      marketSnapshotExpired
    ),
  );
  const inventoryStale = Boolean(inventory && inventoryState.error);
  const distributedBaseUnits = inventory
    ? BigInt(inventory.totalAllocationBaseUnits) - BigInt(inventory.spendableBaseUnits)
    : null;
  const allocationProgress = inventory && distributedBaseUnits !== null
    ? Number((distributedBaseUnits * 10_000n) / BigInt(inventory.totalAllocationBaseUnits)) / 100
    : null;
  const allocationProgressLabel = inventory && distributedBaseUnits !== null
    ? formatDistributionPercent(distributedBaseUnits.toString(), inventory.totalAllocationBaseUnits)
    : null;
  const impactSeverity = marketQuote ? getPriceImpactSeverity(marketQuote.priceImpactPct) : null;
  const highImpact = impactSeverity === "high";
  const extremeImpact = marketQuote ? isWebsitePurchaseBlocked(marketQuote.priceImpactPct) : false;

  const requestQuoteForReview = React.useCallback(() => {
    if (quoteRequester.current.inFlight) return;
    const requestBlockReason = getFoundationQuoteBlockReason({
      connected,
      balanceReady: balanceStatus === "ready",
      inputRaw: inputAmount?.raw ?? null,
      spendableRaw,
      policy: purchasePolicy,
      transactionState: "IDLE",
    });
    if (requestBlockReason || !inputAmount ||
      !marketSnapshotReviewable ||
      !walletAddress ||
      foundationSubmitted.current
    ) {
      quoteRequester.current.cancel();
      setLoadingQuote(false);
      return;
    }

    setQuoteExpired(false);
    setHighImpactConfirmed(false);
    setError(null);
    setRetryableQuoteError(false);
    setLoadingQuote(true);
    const request = async (signal: AbortSignal) => {
      const result = await getMarketProvider().getQuote(inputAmount.normalized, slippageBps, signal, walletAddress);
      validateQuoteForRequest(result, inputAmount.normalized, inputAmount.raw, slippageBps);
      return result;
    };
    const requestHandlers = {
      success: (result: QuoteResult) => {
        setRetryableQuoteError(false);
        setQuote(result);
        setMaterialQuoteChange(Boolean(previewRaw && isMaterialQuoteChange(previewRaw, result.outputAmountRaw)));
        setRemainingSec(Math.max(0, Math.ceil((result.expiresAt - Date.now()) / 1000)));
        if (result.mode === "FOUNDATION_DIRECT") setFoundationStep("REVIEW");
        setStep("review");
      },
      error: (quoteError: unknown) => {
        const retryable = quoteError instanceof QuoteRequestError && quoteError.retryable;
        setRetryableQuoteError(retryable);
        setError(
          retryable
            ? "Live reference price is temporarily unavailable. Retry."
            : quoteError instanceof Error
              ? quoteError.message
              : "Unable to verify this quote.",
        );
      },
      settled: () => setLoadingQuote(false),
    };
    quoteRequester.current.start(request, requestHandlers);
  }, [balanceStatus, connected, inputAmount, marketSnapshotReviewable, previewRaw, purchasePolicy, slippageBps, spendableRaw, walletAddress]);

  React.useEffect(() => () => {
    quoteRequester.current.cancel();
  }, []);

  React.useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const rateIsPositiveDecimal = typeof previewGtreePerSol === "string"
      && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(previewGtreePerSol)
      && !/^0(?:\.0+)?$/.test(previewGtreePerSol);
    const failureCategory = !marketSnapshot
      ? "missing_snapshot_data"
      : marketSnapshot.sourceStatus === "STALE" && !marketSnapshotPreviewable
        ? "incomplete_stale_snapshot"
        : !rateIsPositiveDecimal
          ? "invalid_effective_rate"
          : !previewInputValidation.amount
            ? "invalid_input"
            : !previewRaw
              ? "decimal_parse_failed"
              : !inventory
                ? "missing_inventory"
                : null;
    console.debug(JSON.stringify({
      event: "buy_preview_diagnostic",
      inputParsedSuccessfully: Boolean(previewInputValidation.amount),
      effectiveRateRawType: typeof previewGtreePerSol,
      effectiveRateParsedSuccessfully: rateIsPositiveDecimal,
      snapshotStatus: marketSnapshot?.sourceStatus ?? "UNAVAILABLE",
      snapshotId: marketSnapshot?.snapshotId ?? null,
      previewUsable: Boolean(marketSnapshotPreviewable && previewRaw),
      reviewEligible: Boolean(
        marketSnapshotReviewable
        && connected
        && inputValidation.valid
        && !quoteBlockReason
        && inventory
      ),
      failureCategory,
    }));
  }, [
    connected,
    inputValidation.valid,
    inventory,
    marketSnapshot,
    marketSnapshotPreviewable,
    marketSnapshotReviewable,
    previewGtreePerSol,
    previewInputValidation.amount,
    previewRaw,
    quoteBlockReason,
  ]);

  async function executeSwap() {
    const activeQuote = quote;
    if (
      !wallet ||
      !activeQuote ||
      !inputAmount ||
      activeQuote.inputAmountRaw !== inputAmount.raw ||
      quoteExpired ||
      extremeImpact ||
      insufficientBalance
    ) return;
    setError(null);

    if (activeQuote.mode === "FOUNDATION_DIRECT") {
      setStep("pending");
      setFoundationStep("AWAITING_WALLET");
      try {
        const response = await fetch("/api/foundation/purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: wallet.address,
            inputSol: activeQuote.inputSol,
            inputLamports: activeQuote.inputAmountRaw,
            expectedOutputTokenUnits: activeQuote.outputTokenUnits,
            quoteToken: activeQuote.quoteToken,
          }),
        });
        const payload = (await response.json()) as PreparedSwap & { error?: string; orderId?: string };
        if (!response.ok || !payload.transaction) {
          throw new Error(payload.error || "Could not prepare the Foundation purchase.");
        }

        const preparedTransaction = decodeTransaction(payload.transaction);
        // Snapshot a byte copy, then hand the wallet a separate transaction instance.
        // Some injected providers mutate the object passed to signTransaction.
        const preparedMessage = Uint8Array.from(preparedTransaction.message.serialize());
        const transactionForWallet = VersionedTransaction.deserialize(preparedTransaction.serialize());
        const signedTransaction = await signTransaction(transactionForWallet);
        if (!sameBytes(preparedMessage, signedTransaction.message.serialize())) {
          console.error("[Foundation Direct] Wallet returned a changed transaction message", {
            difference: describeMessageDifference(preparedMessage, signedTransaction.message.serialize()),
            prepared: describeTransaction(preparedTransaction),
            walletReturned: describeTransaction(signedTransaction),
          });
          throw new Error("Your wallet returned a transaction whose approved contents changed. Request a new quote and try again.");
        }
        const submitResponse = await fetch("/api/foundation/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quoteId: payload.orderId || activeQuote.quoteId,
            buyer: wallet.address,
            transaction: btoa(String.fromCharCode(...signedTransaction.serialize())),
          }),
        });
        const submitPayload = (await submitResponse.json()) as { signature?: string; error?: string };
        if (!submitResponse.ok || !submitPayload.signature) {
          throw new Error(submitPayload.error || "The signed Foundation purchase could not be submitted.");
        }
        const submittedSignature = submitPayload.signature;
        foundationSubmitted.current = true;
        setQuoteExpired(false);
        setSignature(submittedSignature);
        setFoundationStep("SUBMITTED");

        // Polling loop
        setFoundationStep("CONFIRMING");
        let pollCount = 0;
        const maxPolls = 30; // 60 seconds total
        let confirmed = false;

        while (pollCount < maxPolls) {
          pollCount++;
          await new Promise((resolve) => setTimeout(resolve, 2000));
          try {
            const confirmResponse = await fetch("/api/foundation/confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                quoteId: activeQuote.quoteId,
                buyer: wallet.address,
                signature: submittedSignature,
              }),
            });
            const confirmPayload = await confirmResponse.json();
            if (confirmResponse.ok && confirmPayload.status === "CONFIRMED") {
              setFoundationStep("CONFIRMED");
              void inventoryState.refresh();
              confirmed = true;
              break;
            } else if (confirmPayload.status === "FAILED") {
              setFoundationStep("FAILED");
              setError(confirmPayload.reason || "Transaction verification failed on-chain.");
              confirmed = true;
              break;
            } else if (confirmPayload.status === "EXPIRED") {
              setFoundationStep("EXPIRED");
              setError("Quote has expired.");
              confirmed = true;
              break;
            }
          } catch {
            // Keep polling on connection glitches
          }
        }

        if (!confirmed) {
          setFoundationStep("FAILED");
          setError("On-chain confirmation timed out. Please check Solscan.");
        }
      } catch (err: any) {
        setError(err instanceof Error ? err.message : "The wallet rejected the transaction.");
        setFoundationStep("FAILED");
      }
      return;
    }

    // Classic Market route path
    setStep("pending");
    try {
      const response = await fetch("/api/market/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: wallet.address,
          inputSol: activeQuote.inputSol,
          inputLamports: activeQuote.inputAmountRaw,
          slippageBps,
          expectedMinimumReceivedRaw: activeQuote.minimumReceivedRaw,
        }),
      });
      const payload = (await response.json()) as PreparedSwap & { error?: string };
      if (!response.ok || !payload.transaction) throw new Error(payload.error || "Could not prepare the purchase.");
      const submittedSignature = await signAndSendTransaction(decodeTransaction(payload.transaction));
      setSignature(submittedSignature);
      setStep("success");
    } catch (swapError) {
      setError(swapError instanceof Error ? swapError.message : "The wallet rejected the transaction.");
      setStep("rejected");
    }
  }

  function reset() {
    foundationSubmitted.current = false;
    setStep("form");
    setFoundationStep("IDLE");
    setSignature(null);
    setError(null);
    setQuoteExpired(false);
    setQuote(null);
    setMaterialQuoteChange(false);
  }

  function requestFreshQuote() {
    reset();
    requestQuoteForReview();
  }

  function backToForm() {
    quoteRequester.current.cancel();
    setStep("form");
    setFoundationStep("IDLE");
    setQuote(null);
    setQuoteExpired(false);
    setMaterialQuoteChange(false);
  }

  function setQuickAmount(numerator: bigint, denominator: bigint) {
    if (spendableRaw === null || spendableRaw <= BigInt(0)) return;
    const amountRaw = fractionOfAtomic(spendableRaw.toString(), numerator, denominator);
    updateSolInput(atomicToDecimal(amountRaw, SOL_DECIMALS));
  }

  function invalidateQuote() {
    foundationSubmitted.current = false;
    quoteRequester.current.cancel();
    setQuoteExpired(false);
    setHighImpactConfirmed(false);
    setError(null);
    setRetryableQuoteError(false);
    setQuote(null);
    setMaterialQuoteChange(false);
    setLoadingQuote(false);
  }

  function updateSolInput(next: string) {
    setSolInput(next);
    invalidateQuote();
  }

  function updateSlippage(next: number) {
    setSlippageBps(next);
    invalidateQuote();
  }

  function expireQuote() {
    setQuoteExpired(true);
    setQuote(null);
    setHighImpactConfirmed(false);
    if (step === "review") setStep("form");
  }

  if (quote?.mode === "FOUNDATION_DIRECT" && step !== "form") {
    const treasury = quote.treasuryRecipient;
    const isExpired = remainingSec <= 0 || quoteExpired;
    const postPurchaseInventory = atomicToDecimal(
      projectFoundationRemaining(quote.availableFoundationInventory, quote.outputTokenUnits),
      9,
    );

    if (foundationStep === "AWAITING_WALLET") {
      return (
        <PurchaseState
          icon={<Loader2 className="size-8 animate-spin text-gt-emerald-bright" aria-hidden />}
          title="Confirm in your wallet"
          description="Awaiting signature. Green Tree prepared a Foundation direct-sale transaction. Verify the SOL payment and GTREE receive amount in your wallet before signing."
        />
      );
    }

    if (foundationStep === "SUBMITTED") {
      return (
        <PurchaseState
          icon={<Loader2 className="size-8 animate-spin text-gt-emerald-bright" aria-hidden />}
          title="Transaction submitted"
          description={`Your wallet submitted the purchase for approximately ${formatDecimalAmount(quote.outputGtree, 6)} GTREE.`}
        >
          <div className="flex flex-col items-center gap-3">
            {signature && (
              <p className="text-xs text-gt-muted">
                Transaction Signature: <span className="font-mono">{signature.slice(0, 10)}...{signature.slice(-10)}</span>
              </p>
            )}
            <Button asChild>
              <a href={`${ENV.solscanBaseUrl}/tx/${signature}`} target="_blank" rel="noopener noreferrer">
                View on Solscan
              </a>
            </Button>
          </div>
        </PurchaseState>
      );
    }

    if (foundationStep === "CONFIRMING") {
      return (
        <PurchaseState
          icon={<Loader2 className="size-8 animate-spin text-gt-emerald-bright" aria-hidden />}
          title="Confirming on Solana Ledger..."
          description="Green Tree is verifying the on-chain settlement details against the cryptographic quote metadata. This may take up to 30 seconds."
        >
          {signature && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-gt-muted">
                Signature: <span className="font-mono">{signature.slice(0, 8)}...{signature.slice(-8)}</span>
              </p>
              <Button variant="outline" asChild>
                <a href={`${ENV.solscanBaseUrl}/tx/${signature}`} target="_blank" rel="noopener noreferrer">
                  Track on Solscan
                </a>
              </Button>
            </div>
          )}
        </PurchaseState>
      );
    }

    if (foundationStep === "CONFIRMED") {
      return (
        <PurchaseState
          icon={<CheckCircle2 className="size-10 text-gt-emerald-bright" aria-hidden />}
          title="Confirmed on Solana"
          description={`Successfully settled! Verified on-chain that you paid exactly ${quote.inputSol} SOL and received exactly ${formatDecimalAmount(quote.outputGtree, 6)} GTREE.`}
        >
          <div className="flex flex-wrap justify-center gap-2">
            {signature && (
              <Button asChild>
                <a href={`${ENV.solscanBaseUrl}/tx/${signature}`} target="_blank" rel="noopener noreferrer">
                  View final Solscan
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={reset}>
              Buy more
            </Button>
          </div>
        </PurchaseState>
      );
    }

    if (foundationStep === "FAILED") {
      return (
        <PurchaseState
          icon={<XCircle className="size-10 text-gt-danger" aria-hidden />}
          title="Transaction verification failed"
          description={error || "On-chain verification or settlement failed. No funds were moved from the treasury."}
        >
          <div className="flex flex-col gap-2 w-full max-w-xs">
            {signature && (
              <Button variant="outline" asChild>
                <a href={`${ENV.solscanBaseUrl}/tx/${signature}`} target="_blank" rel="noopener noreferrer">
                  View failed tx on Solscan
                </a>
              </Button>
            )}
            <Button onClick={requestFreshQuote}>Request new quote</Button>
          </div>
        </PurchaseState>
      );
    }

    if (foundationStep === "EXPIRED") {
      return (
        <PurchaseState
          icon={<XCircle className="size-10 text-gt-warning" aria-hidden />}
          title="Quote expired"
          description="This quote has expired. Signing is disabled. You must request a fresh quote."
        >
          <Button onClick={requestFreshQuote}>Request fresh quote</Button>
        </PurchaseState>
      );
    }

    if (step === "review") {
      return (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gt-fg">Review Purchase (Foundation Direct)</p>
              <p className="mt-1 text-xs text-gt-muted">Standard Solana instruction-based direct transfer.</p>
            </div>
            <span className="text-xs font-semibold text-gt-emerald-bright">Solana Mainnet</span>
          </div>
          <dl className="divide-y divide-gt-border-soft border-y border-gt-border-soft">
            <div className="flex justify-between gap-4 py-2.5 text-xs">
              <dt className="text-gt-muted">You pay</dt>
              <dd className="tabular font-semibold text-gt-fg">
                {quote.inputSol} SOL {quote.inputUsd !== null && quote.inputUsd !== undefined ? `(${formatUsd(quote.inputUsd)})` : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5 text-xs">
              <dt className="text-gt-muted">Estimated receive</dt>
              <dd className="tabular font-semibold text-gt-fg">
                {formatDecimalAmount(quote.outputGtree, 6)} GTREE {quote.outputUsd !== null && quote.outputUsd !== undefined ? `(${formatUsd(quote.outputUsd)})` : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5 text-xs">
              <dt className="text-gt-muted">Foundation rate</dt>
              <dd className="tabular font-semibold text-gt-fg">{formatDecimalAmount((quote as any).gtreePerSol || "0", 4)} GTREE / SOL</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5 text-xs">
              <dt className="text-gt-muted">Reference source</dt>
              <dd className="tabular font-semibold text-gt-fg">{quote.source}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5 text-xs">
              <dt className="text-gt-muted">Divergence check</dt>
              <dd className="tabular font-semibold text-gt-emerald-bright">Divergence safe (under limits)</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5 text-xs">
              <dt className="text-gt-muted">Foundation adjustment</dt>
              <dd className="tabular font-semibold text-gt-fg">Foundation adjustment: 0.00%</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5 text-xs">
              <dt className="text-gt-muted">Route type</dt>
              <dd className="tabular font-semibold text-gt-emerald-bright">Direct transfer, no AMM route used for execution</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5 text-xs">
              <dt className="text-gt-muted">Treasury recipient</dt>
              <dd className="tabular font-semibold text-gt-fg">
                <a href={`https://solscan.io/account/${treasury}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline text-gt-emerald-bright">
                  {treasury.slice(0, 6)}...{treasury.slice(-6)} <ExternalLink className="size-3" />
                </a>
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5 text-xs">
              <dt className="text-gt-muted">Buyer wallet</dt>
              <dd className="tabular font-semibold text-gt-fg font-mono">{wallet?.address.slice(0, 6)}...{wallet?.address.slice(-6)}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5 text-xs">
              <dt className="text-gt-muted">Expected network fee</dt>
              <dd className="tabular font-semibold text-gt-fg">0.00001 SOL (estimate)</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5 text-xs">
              <dt className="text-gt-muted">Available inventory</dt>
              <dd className="tabular font-semibold text-gt-fg">{formatDecimalAmount((quote as any).availableFoundationInventoryGtree || "0", 4)} GTREE</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5 text-xs">
              <dt className="text-gt-muted">Post-purchase inventory</dt>
              <dd className="tabular font-semibold text-gt-fg">
                {formatDecimalAmount(postPurchaseInventory, 4)} GTREE
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5 text-xs">
              <dt className="text-gt-muted">Purchase bounds</dt>
              <dd className="tabular font-semibold text-gt-fg">Min: 0.000000001 SOL · Max: {formatDecimalAmount((quote as any).maximumAllowedPurchaseGtree || "0", 4)} GTREE</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5 text-xs">
              <dt className="text-gt-muted">Quote expiry</dt>
              <dd className={cn("tabular font-semibold", remainingSec <= 5 ? "text-gt-warning animate-pulse" : "text-gt-fg")}>
                {remainingSec > 0 ? `${remainingSec}s` : "Expired"}
              </dd>
            </div>
          </dl>
          {materialQuoteChange && (
            <div role="alert" className="rounded-md border border-gt-warning/40 bg-gt-warning/8 px-3.5 py-3 text-xs text-gt-warning">
              The authoritative Foundation quote changed materially from the local market preview. Review the updated receive amount before continuing.
            </div>
          )}
          <p className="text-xs leading-relaxed text-gt-muted-2">{riskNotice}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={backToForm}>Back</Button>
            <Button disabled={isExpired} onClick={() => void executeSwap()}>
              {isExpired ? "Quote Expired" : "Confirm in wallet"}
            </Button>
          </div>
        </div>
      );
    }
  }

  if (step === "pending") {
    return (
      <PurchaseState
        icon={<Loader2 className="size-8 animate-spin text-gt-emerald-bright" aria-hidden />}
        title="Confirm in your wallet"
        description={quote?.mode === "FOUNDATION_DIRECT" ? "Green Tree prepared a Foundation direct-sale transaction. Verify the SOL payment and GTREE receive amount in your wallet before signing." : "Jupiter prepared a new Solana Mainnet transaction. Verify every value in your wallet before signing."}
      />
    );
  }

  if (step === "success" && quote && signature) {
    return (
      <PurchaseState
        icon={<CheckCircle2 className="size-10 text-gt-emerald-bright" aria-hidden />}
        title="Transaction submitted"
        description={`Your wallet submitted the purchase for approximately ${formatDecimalAmount(quote.outputGtree, 6)} GTREE.`}
      >
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild><a href={`${ENV.solscanBaseUrl}/tx/${signature}`} target="_blank" rel="noopener noreferrer">View on Solscan</a></Button>
          <Button variant="outline" onClick={reset}>New quote</Button>
        </div>
      </PurchaseState>
    );
  }

  if (step === "rejected") {
    return (
      <PurchaseState
        icon={<XCircle className="size-10 text-gt-danger" aria-hidden />}
        title="Transaction not submitted"
        description={error || "The request was rejected. No funds were moved."}
      >
        <Button variant="outline" onClick={reset}>Try again</Button>
      </PurchaseState>
    );
  }

  const balanceLabel = !connected
    ? "Connect your wallet to view balance and continue."
    : balanceStatus === "loading"
      ? "Loading verified SOL balance…"
      : balanceStatus === "error"
        ? balanceError || "SOL balance unavailable."
        : wallet && spendableRaw !== null
          ? `Balance ${formatSol(wallet.solBalance)} · Spendable ${formatDecimalAmount(atomicToDecimal(spendableRaw, SOL_DECIMALS), 4)} SOL`
          : "SOL balance unavailable.";
  const previewOutputExact = previewOutput ? formatDecimalAmount(previewOutput, 3) : null;
  const previewInputUsdExact = previewInputUsd !== null ? formatUsd(previewInputUsd) : null;
  const previewOutputUsdExact = previewOutputUsd !== null ? formatUsd(previewOutputUsd) : null;

  const canReview = Boolean(
    connected &&
    marketSnapshotReviewable &&
    walletState === "connected" &&
    balanceStatus === "ready" &&
    inputAmount &&
    previewRaw &&
    !quoteBlockReason &&
    !loadingQuote &&
    !insufficientBalance &&
    !extremeImpact &&
    (!highImpact || highImpactConfirmed),
  );

  let actionLabel = "Review purchase";
  if (!connected) actionLabel = "Connect wallet";
  else if (!marketSnapshotReviewable) actionLabel = marketSnapshot ? "Market snapshot stale" : "Market snapshot unavailable";
  else if (!inputValidation.valid) actionLabel = inputValidation.code === "length" ? "Amount is too long" : "Enter a valid amount";
  else if (!inputAmount) actionLabel = "Enter an amount";
  else if (insufficientBalance) actionLabel = "Insufficient SOL balance";
  else if (quoteBlockReason === "minimum") actionLabel = "Amount below minimum";
  else if (quoteBlockReason === "maximum") actionLabel = "Amount above maximum";
  else if (quoteBlockReason === "paused") actionLabel = "Purchases paused";
  else if (quoteBlockReason === "mode") actionLabel = "Foundation sale unavailable";
  else if (loadingQuote) actionLabel = "Fetching authoritative quote…";
  else if (retryableQuoteError) actionLabel = "Retry quote";
  else if (!previewRaw) actionLabel = "Market preview unavailable";
  else if (balanceStatus === "loading") actionLabel = "Loading balance…";
  else if (balanceStatus === "error") actionLabel = "Balance unavailable";
  else if (extremeImpact) actionLabel = "Extreme price impact";
  else if (highImpact && !highImpactConfirmed) actionLabel = "Confirm high impact";

  if (step === "review" && quote) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gt-fg">Review purchase</p>
            <p className="mt-1 text-xs text-gt-muted">This authoritative quote was requested once when you selected Review.</p>
          </div>
          <span className="text-xs font-semibold text-gt-emerald-bright">Solana Mainnet</span>
        </div>
        <dl className="divide-y divide-gt-border-soft border-y border-gt-border-soft">
          <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-gt-muted">You pay</dt><dd className="tabular font-semibold">{quote.inputSol} SOL</dd></div>
          <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-gt-muted">Estimated receive</dt><dd className="tabular text-right font-semibold">{formatDecimalAmount(quote.outputGtree, 6)} GTREE</dd></div>
          {quote.mode === "MARKET" && (
            <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-gt-muted">Price impact</dt><dd className="tabular font-semibold text-gt-warning">{quote.priceImpactPct.toFixed(2)}%</dd></div>
          )}
          {quote.mode === "FOUNDATION_DIRECT" && (
            <>
              <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-gt-muted">Treasury recipient</dt><dd className="tabular text-right font-semibold" title={quote.treasuryRecipient}>{quote.treasuryRecipient.slice(0, 6) + "…" + quote.treasuryRecipient.slice(-6)}</dd></div>
              <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-gt-muted">Source</dt><dd className="tabular text-right font-semibold">Foundation inventory</dd></div>
              <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-gt-muted">Vesting & Lockup</dt><dd className="tabular text-right font-semibold text-gt-emerald-bright">None (Immediately Transferable)</dd></div>
            </>
          )}
        </dl>
        {quote.mode === "MARKET" && <QuoteSummary key={quote.quoteId} quote={quote} onExpire={expireQuote} onRefresh={() => { setStep("form"); requestQuoteForReview(); }} />}
        <p className="text-xs leading-relaxed text-gt-muted-2">{riskNotice}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={backToForm}>Back</Button>
          <Button onClick={() => void executeSwap()}>Confirm in wallet</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gt-fg">Buy GTREE</h3>
        </div>
        <div className="min-w-0 text-right">
          <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", marketSnapshot ? "text-gt-emerald-bright" : "text-gt-muted")}>
            {loadingQuote || marketSnapshotState.loading ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Radio className="size-3" aria-hidden />}
            {loadingQuote ? "Fetching Foundation quote" : retryableQuoteError ? "Reference unavailable" : marketSnapshotStale ? "Stale market preview" : marketSnapshot ? "Live market preview" : "Market snapshot unavailable"}
          </span>
          <p className="mt-1 text-[11px] text-gt-muted-2">{foundationQuote ? "Review: Green Tree Foundation" : "Meteora DAMM v2 snapshot"}</p>
        </div>
      </div>

      <div className="rounded-md bg-black/15 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <Label htmlFor="sol-input" className="text-xs font-semibold text-gt-muted">You pay</Label>
          <p className="max-w-[65%] text-right text-[11px] leading-relaxed text-gt-muted-2">{balanceLabel}</p>
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-3 overflow-hidden">
          <Input
            id="sol-input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={solInput}
            onChange={(event) => updateSolInput(event.target.value)}
            onBlur={() => {
              const normalized = normalizeDecimalInput(solInput, SOL_DECIMALS);
              if (normalized !== solInput) updateSolInput(normalized);
            }}
            aria-describedby="sol-input-validation purchase-status"
            aria-invalid={!inputValidation.valid}
            className="tabular h-14 min-w-0 whitespace-nowrap overflow-x-auto border-none bg-transparent px-0 text-[clamp(1.65rem,6vw,2.25rem)] font-semibold focus-visible:border-none"
          />
          <span className="shrink-0 rounded-sm bg-gt-surface-3 px-3 py-2 text-sm font-semibold text-gt-fg">SOL</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <button type="button" disabled={balanceStatus !== "ready" || !connected} onClick={() => setQuickAmount(BigInt(1), BigInt(4))} className="rounded-sm border border-gt-border px-2.5 py-1 text-xs text-gt-muted transition-colors hover:text-gt-fg disabled:cursor-not-allowed disabled:opacity-40">25%</button>
          <button type="button" disabled={balanceStatus !== "ready" || !connected} onClick={() => setQuickAmount(BigInt(1), BigInt(2))} className="rounded-sm border border-gt-border px-2.5 py-1 text-xs text-gt-muted transition-colors hover:text-gt-fg disabled:cursor-not-allowed disabled:opacity-40">50%</button>
          <button type="button" disabled={balanceStatus !== "ready" || !connected} onClick={() => setQuickAmount(BigInt(1), BigInt(1))} className="rounded-sm border border-gt-border px-2.5 py-1 text-xs text-gt-muted transition-colors hover:text-gt-fg disabled:cursor-not-allowed disabled:opacity-40">Max</button>
          <button type="button" onClick={() => updateSolInput("")} className="ml-auto inline-flex items-center gap-1 px-1 py-1 text-xs text-gt-muted hover:text-gt-fg" aria-label="Clear SOL amount"><RotateCcw className="size-3.5" aria-hidden /> Clear</button>
        </div>

        <div className="my-4 flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-gt-border-soft" />
          <ArrowDown className="size-4 text-gt-emerald-bright" />
          <span className="h-px flex-1 bg-gt-border-soft" />
        </div>

        <div className="flex min-w-0 items-end justify-between gap-3 overflow-hidden">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gt-muted">
              Estimated receive
              {loadingQuote && quote && <span className="ml-2 font-normal text-gt-muted-2">Updating quote…</span>}
              {previewOutput && <span className="ml-2 font-normal text-gt-muted-2">Local market preview</span>}
            </p>
            <p
              className="tabular mt-2 min-w-0 truncate whitespace-nowrap text-[clamp(1.65rem,6vw,2.25rem)] font-semibold leading-none text-gt-fg"
              aria-live="polite"
              aria-label={previewOutputExact ? `Estimated receive ${previewOutputExact} GTREE` : undefined}
              title={previewOutputExact ? `${previewOutputExact} GTREE` : undefined}
            >
            {previewOutput ? formatDecimalAmount(previewOutput, 3) : marketSnapshotPreviewable ? "0" : "Unavailable"}
            </p>
          </div>
          <span className="shrink-0 rounded-sm bg-gt-surface-3 px-3 py-2 text-sm font-semibold text-gt-fg">GTREE</span>
        </div>

        <div className="mt-4 grid gap-3 border-t border-gt-border-soft pt-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-gt-muted-2">Input market value</p>
            <p className="tabular mt-1 truncate whitespace-nowrap text-sm font-semibold text-gt-fg" title={previewInputUsdExact ?? undefined} aria-label={previewInputUsdExact ? `Input market value ${previewInputUsdExact}` : undefined}>{previewInputUsd !== null ? formatUsd(previewInputUsd) : "USD estimate unavailable"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-gt-muted-2">Estimated output value</p>
            <p className="tabular mt-1 truncate whitespace-nowrap text-sm font-semibold text-gt-fg" title={previewOutputUsdExact ?? undefined} aria-label={previewOutputUsdExact ? `Estimated output value ${previewOutputUsdExact}` : undefined}>{previewOutputUsd !== null ? formatUsd(previewOutputUsd) : "USD estimate unavailable"}</p>
          </div>
        </div>

        <dl className="mt-4 divide-y divide-gt-border-soft border-t border-gt-border-soft pt-2 text-xs">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 py-2">
            <dt className="text-gt-muted">Preview market rate</dt>
            <dd className="tabular min-w-0 truncate whitespace-nowrap text-right text-gt-fg" title={previewRate ? `1 SOL ≈ ${formatDecimalAmount(previewRate, 12)} GTREE` : undefined} aria-label={previewRate ? `Preview market rate 1 SOL approximately ${formatDecimalAmount(previewRate, 12)} GTREE` : undefined}>{previewRate ? `1 SOL ≈ ${formatDecimalAmount(previewRate, 3)} GTREE` : "Unavailable"}</dd>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 py-2">
            <dt className="text-gt-muted">GTREE market price</dt>
            <dd className="tabular min-w-0 truncate whitespace-nowrap text-right text-gt-fg" title={marketSnapshot ? `1 GTREE ≈ ${formatUsd(marketSnapshot.gtreeUsd)}` : undefined}>{marketSnapshot ? `1 GTREE ≈ ${formatUsd(marketSnapshot.gtreeUsd)}` : "Unavailable"}</dd>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 py-2">
            <dt className="text-gt-muted">Available now</dt>
            <dd className="tabular min-w-0 truncate whitespace-nowrap text-right text-gt-fg" title={inventory ? `${formatDecimalAmount(inventory.spendableGtree, inventory.tokenDecimals)} GTREE${inventoryStale ? " · stale" : ""}` : undefined} aria-label={inventory ? `Available now ${formatDecimalAmount(inventory.spendableGtree, inventory.tokenDecimals)} GTREE${inventoryStale ? ", stale" : ""}` : undefined}>
              {inventory ? `${formatDecimalAmount(inventory.spendableGtree, inventory.tokenDecimals)} GTREE${inventoryStale ? " · stale" : ""}` : inventoryState.loading ? "Loading…" : "Inventory temporarily unavailable"}
            </dd>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 py-2">
            <dt className="text-gt-muted">After this purchase</dt>
            <dd className="tabular min-w-0 truncate whitespace-nowrap text-right text-gt-fg" title={projectedRemaining && inventory ? `${formatDecimalAmount(projectedRemaining, inventory.tokenDecimals)} GTREE` : undefined} aria-label={projectedRemaining && inventory ? `After this purchase ${formatDecimalAmount(projectedRemaining, inventory.tokenDecimals)} GTREE` : undefined}>{projectedRemaining && inventory ? `${formatDecimalAmount(projectedRemaining, inventory.tokenDecimals)} GTREE` : "Inventory temporarily unavailable"}</dd>
          </div>
        </dl>
        {inventory && allocationProgress !== null && allocationProgressLabel && (
          <div className="mt-3" aria-label={`${allocationProgressLabel} of Foundation allocation distributed`}>
            <div className="flex justify-between text-[11px] text-gt-muted-2">
              <span>Foundation allocation distributed</span>
              <span>{allocationProgressLabel}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gt-surface-3">
              <div className="h-full bg-gt-emerald" style={{ width: `${Math.min(Math.max(allocationProgress, 0), 100)}%` }} />
            </div>
          </div>
        )}
        <p className="mt-3 text-[11px] text-gt-muted-2">
          Estimated from current market price{marketSnapshotStale ? " · last valid snapshot is stale" : ""}.
          {marketSnapshot && purchasePolicy?.purchaseMode === "FOUNDATION_DIRECT" && marketSnapshot.priceAdjustmentBps !== 0
            ? ` Includes Foundation adjustment of ${marketSnapshot.priceAdjustmentBps} bps.`
            : ""}
        </p>
        {quoteMatchesInput && quote?.websiteBonus && (
          <dl className="mt-4 divide-y divide-gt-border-soft border-t border-gt-border-soft pt-2 text-xs">
            <div className="flex justify-between py-2"><dt className="text-gt-muted">Market route output</dt><dd>{formatDecimalAmount(quote.outputGtree, 6)} GTREE</dd></div>
            <div className="flex justify-between py-2"><dt className="text-gt-muted">Website bonus</dt><dd className="text-gt-emerald-bright">+{formatDecimalAmount(quote.websiteBonus.bonusGtree, 6)} GTREE (+{(quote.websiteBonus.bonusBps / 100).toFixed(1)}%)</dd></div>
            <div className="flex justify-between py-2 font-semibold"><dt>Total expected</dt><dd>{formatDecimalAmount(quote.websiteBonus.totalExpectedGtree, 6)} GTREE</dd></div>
          </dl>
        )}
      </div>

      {marketQuote && <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-gt-muted">Max slippage <span className="text-gt-muted-2">(not price impact)</span></span>
        <div className="flex gap-1.5" aria-label="Maximum slippage">
          {SLIPPAGE_OPTIONS.map((bps) => (
            <button
              key={bps}
              type="button"
              onClick={() => updateSlippage(bps)}
              aria-pressed={slippageBps === bps}
              className={cn(
                "rounded-sm px-2.5 py-1.5 text-xs font-semibold transition-colors",
                slippageBps === bps ? "bg-gt-emerald text-gt-black" : "border border-gt-border text-gt-muted hover:text-gt-fg",
              )}
            >
              {(bps / 100).toFixed(1)}%
            </button>
          ))}
        </div>
      </div>}

      {marketQuote && !quoteExpired && <QuoteSummary key={marketQuote.quoteId} quote={marketQuote} onExpire={expireQuote} onRefresh={requestQuoteForReview} />}

      {marketQuote && (highImpact || extremeImpact) && (
        <div role="alert" className={cn("rounded-md border px-3.5 py-3", extremeImpact ? "border-gt-danger/45 bg-gt-danger/10" : "border-gt-warning/40 bg-gt-warning/8")}>
          <div className="flex gap-2.5">
            <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", extremeImpact ? "text-gt-danger" : "text-gt-warning")} aria-hidden />
            <div>
              <p className={cn("text-sm font-semibold", extremeImpact ? "text-gt-danger" : "text-gt-warning")}>
                {extremeImpact ? "Extreme price impact" : "High price impact"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-gt-muted">
                The estimated output is substantially below the input market value because available liquidity is limited.
                {marketQuote.quoteLossUsd !== null ? ` Approximate reference-value loss: ${formatUsd(marketQuote.quoteLossUsd)}${marketQuote.quoteLossPct !== null ? ` (${marketQuote.quoteLossPct.toFixed(1)}%)` : ""}.` : ""}
                {extremeImpact ? " Website purchase is disabled; reduce the amount or use Jupiter with its full safeguards." : " Consider reducing the amount."}
              </p>
              {highImpact && !extremeImpact && (
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs font-medium text-gt-fg">
                  <input type="checkbox" checked={highImpactConfirmed} onChange={(event) => setHighImpactConfirmed(event.target.checked)} className="mt-0.5 size-4 accent-gt-emerald" />
                  I understand the high price impact and want to review this purchase.
                </label>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className={cn("rounded-md border px-3 py-2 text-xs", retryableQuoteError ? "border-gt-warning/30 bg-gt-warning/5 text-gt-warning" : "border-gt-danger/30 bg-gt-danger/5 text-gt-danger")}>
          <p>{error}</p>
          {retryableQuoteError && (
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-gt-emerald-bright hover:text-gt-offwhite disabled:opacity-50"
              disabled={loadingQuote || Boolean(quoteBlockReason)}
              onClick={requestQuoteForReview}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Retry
            </button>
          )}
        </div>
      )}
      <div id="sol-input-validation" className="h-9 min-w-0 overflow-hidden">
        {!inputValidation.valid && (
          <p
            role="alert"
            title={inputValidation.message ?? undefined}
            className="h-9 truncate whitespace-nowrap rounded-md border border-gt-warning/30 bg-gt-warning/5 px-3 py-2 text-xs text-gt-warning"
          >
            {inputValidation.message}
          </p>
        )}
      </div>
      {quoteBlockReason === "minimum" && purchasePolicy && <p role="alert" className="rounded-md border border-gt-warning/30 bg-gt-warning/5 px-3 py-2 text-xs text-gt-warning">Enter at least {atomicToDecimal(purchasePolicy.minPurchaseLamports, SOL_DECIMALS)} SOL.</p>}
      {quoteBlockReason === "maximum" && purchasePolicy && <p role="alert" className="rounded-md border border-gt-warning/30 bg-gt-warning/5 px-3 py-2 text-xs text-gt-warning">Enter no more than {atomicToDecimal(purchasePolicy.maxPurchaseLamports, SOL_DECIMALS)} SOL.</p>}

      <div id="purchase-status" role="status" aria-live="polite" className="sr-only">
        {loadingQuote ? "Fetching a new quote." : error ? error : quote ? `Verified quote for ${quote.inputSol} SOL.` : "No verified quote available."}
      </div>

      <Button
        size="lg"
        disabled={connected && !canReview}
        onClick={() => connected ? canReview && requestQuoteForReview() : openDialog()}
        aria-describedby="purchase-status"
        title={connected && !canReview ? actionLabel : undefined}
      >
        {!connected && <WalletIcon className="size-4" aria-hidden />}
        {loadingQuote && connected && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {actionLabel}
      </Button>
    </div>
  );
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function describeMessageDifference(left: Uint8Array, right: Uint8Array) {
  const firstDifferentByte = Math.min(left.length, right.length);
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) {
      return { kind: "bytes", firstDifferentByte: index, preparedByte: left[index], walletByte: right[index], preparedLength: left.length, walletLength: right.length };
    }
  }
  return left.length === right.length
    ? { kind: "none", preparedLength: left.length, walletLength: right.length }
    : { kind: "length", firstDifferentByte, preparedLength: left.length, walletLength: right.length };
}

function describeTransaction(transaction: VersionedTransaction) {
  const message = transaction.message;
  const requiredSignerKeys = message.staticAccountKeys
    .slice(0, message.header.numRequiredSignatures)
    .map((key) => key.toBase58());
  return {
    version: message.version,
    recentBlockhash: message.recentBlockhash,
    requiredSignerKeys,
    signaturePresent: transaction.signatures.map((signature) => !signature.every((byte) => byte === 0)),
    staticAccountKeys: message.staticAccountKeys.map((key) => key.toBase58()),
    instructions: message.compiledInstructions.map((instruction) => ({
      programId: message.staticAccountKeys[instruction.programIdIndex]?.toBase58() ?? "missing",
      accountIndexes: [...instruction.accountKeyIndexes],
      dataLength: instruction.data.length,
    })),
    messageLength: message.serialize().length,
  };
}
