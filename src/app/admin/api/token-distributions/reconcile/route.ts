import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin/admin-request";
import { TokenDistributionService } from "@/lib/admin/token-distributions";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const authorization = await authorizeAdminApi(request, "token-distributions.confirm", true);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  return NextResponse.json(await new TokenDistributionService().reconcile(authorization.session.user));
}
