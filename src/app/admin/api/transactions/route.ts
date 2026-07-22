import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin/admin-request";
import {
  getFoundationTransactions,
  type FoundationTransactionState,
  type FoundationTransactionView,
  type TransactionFilters,
} from "@/lib/admin/operations-data";

export const runtime = "nodejs";

const STATES = new Set<FoundationTransactionState>([
  "CREATED", "BUILT", "SUBMITTED", "CONFIRMED", "EXPIRED", "FAILED",
]);
const VIEWS = new Set<FoundationTransactionView>([
  "SALES", "CONFIRMED", "PENDING", "FAILED", "EXPIRED", "ALL",
]);

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = await authorizeAdminApi(request, "operations.read", false);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const url = new URL(request.url);
  const stateValue = url.searchParams.get("state");
  const viewValue = url.searchParams.get("view");
  const filters: TransactionFilters = {
    view: viewValue && VIEWS.has(viewValue as FoundationTransactionView)
      ? viewValue as FoundationTransactionView
      : "SALES",
    state: stateValue && STATES.has(stateValue as FoundationTransactionState)
      ? stateValue as FoundationTransactionState
      : undefined,
    query: url.searchParams.get("query") ?? undefined,
    from: dateValue(url.searchParams.get("from"), false),
    to: dateValue(url.searchParams.get("to"), true),
    page: integerValue(url.searchParams.get("page")),
    pageSize: integerValue(url.searchParams.get("pageSize")),
  };
  return NextResponse.json(getFoundationTransactions(filters), {
    headers: { "cache-control": "no-store" },
  });
}

function integerValue(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function dateValue(value: string | null, end: boolean): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isFinite(parsed) ? parsed : undefined;
}
