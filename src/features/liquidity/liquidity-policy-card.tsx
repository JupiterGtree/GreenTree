import Link from "next/link";
import { ScrollText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LiquidityPolicyCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="size-4 text-gt-emerald-bright" aria-hidden />
          Liquidity Policy
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm text-gt-muted">
        <p>
          Liquidity actions are executed through the official Green Tree treasury-control process and
          reported with the applicable threshold, cumulative target, assets added, route, and
          transaction reference.
        </p>
        <p>
          This policy does not guarantee a token price, price floor, buyback, trading volume, or
          permanent liquidity value.
        </p>
        <Link href="/docs#liquidity-policy" className="inline-flex items-center gap-1 text-gt-emerald-bright hover:underline">
          Read the full Liquidity Policy
        </Link>
      </CardContent>
    </Card>
  );
}
