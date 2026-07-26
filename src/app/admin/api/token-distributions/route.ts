import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin/admin-request";
import { TokenDistributionError, TokenDistributionService } from "@/lib/admin/token-distributions";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = await authorizeAdminApi(request, "token-distributions.view", false);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  try {
    const url = new URL(request.url);
    const service = new TokenDistributionService();
    const dashboard = await service.dashboard(authorization.session.user);
    const list = service.list({
      query: url.searchParams.get("query") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      page: Number(url.searchParams.get("page") || 1),
      pageSize: 25,
    }, authorization.session.user);
    return NextResponse.json({
      dashboard,
      list,
      categories: service.categories,
      distributionTypes: service.distributionTypes,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const authorization = await authorizeAdminApi(request, "token-distributions.create", true);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  try {
    const body = await boundedJson(request);
    const result = await new TokenDistributionService().preview({
      recipientWalletAddress: String(body.recipientWalletAddress ?? ""),
      amountGtree: String(body.amountGtree ?? ""),
      allocationCategory: String(body.allocationCategory ?? ""),
      distributionType: String(body.distributionType ?? ""),
      internalNote: typeof body.internalNote === "string" ? body.internalNote : undefined,
      publicDescription: typeof body.publicDescription === "string" ? body.publicDescription : undefined,
      externalReference: typeof body.externalReference === "string" ? body.externalReference : undefined,
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
      connectedFeePayerAddress: typeof body.connectedFeePayerAddress === "string" ? body.connectedFeePayerAddress : null,
    }, authorization.session.user);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

async function boundedJson(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 16_384) {
    throw new TokenDistributionError("Request body is too large.");
  }
  const text = await request.text();
  if (text.length > 16_384) throw new TokenDistributionError("Request body is too large.");
  return JSON.parse(text) as Record<string, unknown>;
}

function errorResponse(error: unknown) {
  if (error instanceof TokenDistributionError) {
    const status = error.code === "DENIED" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json({ error: "Token distribution request failed." }, { status: 500 });
}
