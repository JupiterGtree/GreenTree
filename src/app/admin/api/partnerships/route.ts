import { NextResponse } from "next/server";
import { authorizePartnershipRequest } from "@/lib/admin/partnership-request";
import {
  PARTNERSHIP_CATEGORIES, PARTNERSHIP_STATUSES, getPartnershipRepository,
  type PartnershipCategory, type PartnershipStatus,
} from "@/lib/partnerships/repository";
import { PartnershipService } from "@/lib/partnerships/service";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = await authorizePartnershipRequest(request);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const url = new URL(request.url);
  const statusValue = url.searchParams.get("status");
  const categoryValue = url.searchParams.get("category");
  const filters = {
    query: url.searchParams.get("q") ?? undefined,
    status: PARTNERSHIP_STATUSES.includes(statusValue as PartnershipStatus)
      ? statusValue as PartnershipStatus : undefined,
    category: PARTNERSHIP_CATEGORIES.includes(categoryValue as PartnershipCategory)
      ? categoryValue as PartnershipCategory : undefined,
    from: parseDate(url.searchParams.get("from"), false),
    to: parseDate(url.searchParams.get("to"), true),
    sort: url.searchParams.get("sort") === "oldest" ? "oldest" as const : "newest" as const,
    page: positiveInteger(url.searchParams.get("page"), 1),
    pageSize: positiveInteger(url.searchParams.get("pageSize"), 25),
  };
  const result = getPartnershipRepository().list(filters);
  if (url.searchParams.get("format") !== "csv") return NextResponse.json(result);
  if (!["OWNER", "ADMIN"].includes(authorization.session.user.role)) {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }
  const all = getPartnershipRepository().list({ ...filters, page: 1, pageSize: 100 }).items;
  const csv = new PartnershipService().exportCsv(all, authorization.session.user);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="partnerships-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function parseDate(value: string | null, end: boolean) {
  if (!value) return undefined;
  const time = Date.parse(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isFinite(time) ? time : undefined;
}
