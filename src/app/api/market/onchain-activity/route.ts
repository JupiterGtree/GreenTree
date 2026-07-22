import { NextResponse } from "next/server";
import { getOnchainActivity } from "@/lib/market/onchain-activity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await getOnchainActivity();
    return NextResponse.json({
      records: payload.records,
      partialData: payload.partialData,
      fetchedAt: payload.fetchedAt,
      diagnostics: process.env.NODE_ENV === "development" ? payload.diagnostics : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load Solana activity.",
        retryable: true,
        records: [],
        partialData: false,
      },
      { status: 503 },
    );
  }
}
