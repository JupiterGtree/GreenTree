import Link from "next/link";

export function MarketRiskDisclaimer({ text }: { text: string }) {
  return (
    <div className="mt-3 w-full">
      <p className="max-w-5xl text-xs leading-relaxed text-gt-muted-2">
        {text} Read the full{" "}
        <Link href="/docs/TOKEN_MARKET_POLICY.md" className="text-gt-emerald-bright hover:underline">
          Token and Market Policy
        </Link>
        .
      </p>
    </div>
  );
}
