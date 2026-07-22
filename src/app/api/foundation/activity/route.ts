import { NextResponse } from "next/server";
import { getFoundationTransactions } from "@/lib/admin/operations-data";

export const dynamic = "force-dynamic";

const MAX_PUBLIC_RECORDS = 15;

/**
 * Public, read-only Foundation sale activity. This deliberately uses the same
 * durable quote ledger as settlement and Admin Transactions, but exposes only
 * confirmed records and the fields that are safe to show publicly.
 */
export function GET(request: Request) {
  const requestedLimit = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MAX_PUBLIC_RECORDS)
    : 3;
  const result = getFoundationTransactions({ view: "CONFIRMED", page: 1, pageSize: limit });

  if (!result.available) {
    return NextResponse.json(
      { error: "Foundation sale ledger is temporarily unavailable.", records: [] },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json({
    records: result.items.map((item) => ({
      buyer: item.buyer,
      inputLamports: item.inputLamports,
      outputTokenUnits: item.outputTokenUnits,
      signature: item.signature,
      confirmedAt: item.confirmedAt,
    })),
    totalConfirmed: result.total,
    fetchedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
