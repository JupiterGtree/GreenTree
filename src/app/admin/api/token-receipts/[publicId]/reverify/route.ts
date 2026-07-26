import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin/admin-request";
import { TokenReceiptError, TokenReceiptService } from "@/lib/admin/token-receipts";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ publicId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const authorization = await authorizeAdminApi(request, "token-receipts.reverify", true);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  try {
    const { publicId } = await context.params;
    return NextResponse.json({ receipt: await new TokenReceiptService().reverify(publicId, authorization.session.user) });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof TokenReceiptError) {
    const status = error.code === "DENIED" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json({ error: "Token receipt request failed." }, { status: 500 });
}
