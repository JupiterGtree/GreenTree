import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin/admin-request";
import { AuditLogService, type AuditFilters } from "@/lib/admin/audit-log";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = await authorizeAdminApi(request, "audit.read", false);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const filters = filtersFromUrl(new URL(request.url));
  return NextResponse.json(new AuditLogService().list(filters, authorization.session.user), {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const authorization = await authorizeAdminApi(request, "admin.users.manage", true);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  if (Number(request.headers.get("content-length") ?? 0) > 8_192) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 8_192) throw new Error();
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (body.action !== "export") return NextResponse.json({ error: "A valid action is required." }, { status: 400 });
  const filters = filtersFromObject(body.filters);
  const csv = new AuditLogService().exportCsv(filters, authorization.session.user);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="admin-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}

function filtersFromUrl(url: URL): AuditFilters {
  return {
    actor: url.searchParams.get("actor") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    entity: url.searchParams.get("entity") ?? undefined,
    result: parseResult(url.searchParams.get("result")),
    from: parseDate(url.searchParams.get("from"), false),
    to: parseDate(url.searchParams.get("to"), true),
    page: parseInteger(url.searchParams.get("page")),
    pageSize: parseInteger(url.searchParams.get("pageSize")),
  };
}

function filtersFromObject(value: unknown): AuditFilters {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    actor: stringValue(input.actor), action: stringValue(input.action), entity: stringValue(input.entity),
    result: parseResult(stringValue(input.result) ?? null),
    from: numberValue(input.from), to: numberValue(input.to),
  };
}

function parseResult(value: string | null) {
  return value === "SUCCESS" || value === "FAILURE" || value === "DENIED" ? value : undefined;
}
function parseInteger(value: string | null) { const number = Number(value); return Number.isSafeInteger(number) ? number : undefined; }
function parseDate(value: string | null, end: boolean) {
  if (!value) return undefined;
  const time = Date.parse(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isFinite(time) ? time : undefined;
}
function stringValue(value: unknown) { return typeof value === "string" ? value : undefined; }
function numberValue(value: unknown) { return Number.isSafeInteger(value) ? value as number : undefined; }
