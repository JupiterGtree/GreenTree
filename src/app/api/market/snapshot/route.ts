import { NextResponse } from "next/server";
import { getMarketSnapshot } from "@/data/market/get-market-snapshot";

export async function GET() {
  return NextResponse.json(await getMarketSnapshot());
}
