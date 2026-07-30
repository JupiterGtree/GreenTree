import Link from "next/link";

export function MarketRiskDisclaimer({ text }: { text: string }) {
  return (
    <div className="mt-6 w-full border-t border-gt-border/80 pt-5">
      <p className="max-w-5xl text-xs leading-relaxed text-gt-muted-2">
        {text} Read the full{" "}
        <Link href="/docs#token-market-policy" className="text-gt-emerald-bright hover:underline">
          Token and Market Policy
        </Link>
        .
      </p>
    </div>
  );
}
