import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin/admin-request";
import { TokenReceiptError, TokenReceiptService } from "@/lib/admin/token-receipts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = await authorizeAdminApi(request, "token-receipts.import", true);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  try {
    const body = await boundedJson(request);
    const receipt = await new TokenReceiptService().importExisting(
      String(body.transactionSignature ?? ""),
      typeof body.publicDescription === "string" ? body.publicDescription : undefined,
      authorization.session.user,
    );
    return NextResponse.json({ receipt });
  } catch (error) {
    return errorResponse(error);
  }
}

async function boundedJson(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 8_192) throw new TokenReceiptError("Request body is too large.");
  const text = await request.text();
  if (text.length > 8_192) throw new TokenReceiptError("Request body is too large.");
  return JSON.parse(text) as Record<string, unknown>;
}

function errorResponse(error: unknown) {
  if (error instanceof TokenReceiptError) {
    const status = error.code === "DENIED" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json({ error: "Token receipt request failed." }, { status: 500 });
}
