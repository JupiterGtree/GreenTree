import { NextResponse } from "next/server";
import { SupportRateLimitError, SupportService, SupportValidationError, type SupportInput } from "@/lib/support/service";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const raw = await request.text();
    if (raw.length > 8_192) return failure(413);
    const input = JSON.parse(raw) as SupportInput;
    const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ?? "unknown";
    const result = new SupportService().submit(input, ip);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof SupportRateLimitError) return failure(429);
    if (error instanceof SupportValidationError || error instanceof SyntaxError) return failure(400);
    return failure(500);
  }
}
function failure(status: number) { return NextResponse.json({ success: false, error: "The support request could not be submitted. Please review the form and try again." }, { status }); }
