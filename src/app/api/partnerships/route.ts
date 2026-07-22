import { NextResponse } from "next/server";
import {
  PartnershipRateLimitError, PartnershipService, PartnershipValidationError,
  type PartnershipInput,
} from "@/lib/partnerships/service";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > 16_384) return failure(413);
    const raw = await request.text();
    if (raw.length > 16_384) return failure(413);
    const input = JSON.parse(raw) as PartnershipInput;
    const ipAddress = request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ?? "unknown";
    const result = new PartnershipService().submit(input, ipAddress);
    return NextResponse.json({
      success: true,
      duplicate: result.duplicate,
      requestNumber: result.requestNumber,
    }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof PartnershipRateLimitError) return failure(429);
    if (error instanceof PartnershipValidationError || error instanceof SyntaxError) return failure(400);
    return failure(500);
  }
}

function failure(status: number) {
  return NextResponse.json(
    { success: false, error: "The request could not be submitted. Please review the form and try again." },
    { status },
  );
}
