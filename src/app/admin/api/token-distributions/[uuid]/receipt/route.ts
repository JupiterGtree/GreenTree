import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin/admin-request";
import { TokenReceiptError, TokenReceiptService } from "@/lib/admin/token-receipts";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ uuid: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const authorization = await authorizeAdminApi(request, "token-receipts.create", true);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  try {
    const { uuid } = await context.params;
    const receipt = new TokenReceiptService().ensureReceiptForDistribution(uuid, authorization.session.user, "retry");
    return NextResponse.json({ receipt });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof TokenReceiptError) {
    const status = error.code === "DENIED" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  const message = error instanceof Error ? error.message : "Token receipt request failed.";
  console.error("token_receipt_request_failed", { message: message.slice(0, 240) });
  return NextResponse.json({ error: message, code: "RECEIPT_REQUEST_FAILED" }, { status: 500 });
}
