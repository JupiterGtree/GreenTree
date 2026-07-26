import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin/admin-request";
import { TokenDistributionError, TokenDistributionService } from "@/lib/admin/token-distributions";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ uuid: string }> }): Promise<NextResponse> {
  const authorization = await authorizeAdminApi(request, "token-distributions.view", false);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  try {
    const { uuid } = await params;
    return NextResponse.json({ record: new TokenDistributionService().get(uuid, authorization.session.user) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ uuid: string }> }): Promise<NextResponse> {
  const authorization = await authorizeAdminApi(request, "token-distributions.cancel", true);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  try {
    const { uuid } = await params;
    return NextResponse.json({ record: await new TokenDistributionService().cancel(uuid, authorization.session.user) });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof TokenDistributionError) {
    const status = error.code === "DENIED" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json({ error: "Token distribution request failed." }, { status: 500 });
}
