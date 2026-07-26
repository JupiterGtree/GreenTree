import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin/admin-request";
import { TokenDistributionService } from "@/lib/admin/token-distributions";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = await authorizeAdminApi(request, "token-distributions.export", false);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const csv = new TokenDistributionService().exportCsv(authorization.session.user);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="token-distributions.csv"`,
      "cache-control": "no-store",
    },
  });
}
