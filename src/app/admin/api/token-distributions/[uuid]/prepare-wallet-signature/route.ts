import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin/admin-request";
import { TokenDistributionError, TokenDistributionService } from "@/lib/admin/token-distributions";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ uuid: string }> }): Promise<NextResponse> {
  const authorization = await authorizeAdminApi(request, "token-distributions.confirm", true);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  try {
    const { uuid } = await params;
    const body = await request.json() as { connectedWalletAddress?: string };
    const result = await new TokenDistributionService().prepareConnectedWalletSignature(
      uuid,
      body.connectedWalletAddress ?? "",
      authorization.session.user,
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof TokenDistributionError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  return NextResponse.json({ error: "Unable to prepare wallet signature." }, { status: 500 });
}
