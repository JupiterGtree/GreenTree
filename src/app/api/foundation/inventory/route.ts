import { NextResponse } from "next/server";
import { getFoundationInventorySnapshot } from "@/lib/purchase/foundation-inventory-server";

export async function GET() {
  try {
    return NextResponse.json(await getFoundationInventorySnapshot());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Foundation inventory is unavailable." },
      { status: 503 },
    );
  }
}
