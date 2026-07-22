import { NextResponse } from "next/server";
import { getFoundationDirectQuotePolicy } from "@/lib/purchase/foundation-quote-policy";

export async function GET() {
  return NextResponse.json(getFoundationDirectQuotePolicy());
}
