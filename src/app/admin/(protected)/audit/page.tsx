import Link from "next/link";
import { redirect } from "next/navigation";
import { AuditExport } from "@/components/admin/audit-export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuditLogService, type AuditFilters } from "@/lib/admin/audit-log";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/request";

export const dynamic = "force-dynamic";

interface Query { actor?: string; action?: string; entity?: string; result?: string; from?: string; to?: string; page?: string }

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Query> }) {
  const session = await getCurrentAdminSession();
  if (!session) redirect("/admin/login");
  if (!hasAdminPermission(session.user.role, "audit.read")) redirect("/admin");
  const query = await searchParams;
  const filters: AuditFilters = {
    actor: query.actor, action: query.action, entity: query.entity,
    result: query.result === "SUCCESS" || query.result === "FAILURE" || query.result === "DENIED" ? query.result : undefined,
    from: parseDate(query.from, false), to: parseDate(query.to, true),
    page: Math.max(Number(query.page) || 1, 1), pageSize: 25,
  };
  const result = new AuditLogService().list(filters, session.user);
  const pages = Math.max(Math.ceil(result.total / result.pageSize), 1);
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-gt-emerald-bright">Security history</p>
          <h1 className="mt-2 text-3xl font-semibold">Audit log</h1>
          <p className="mt-2 text-sm text-gt-muted">{result.total} append-only record{result.total === 1 ? "" : "s"}.</p>
        </div>
        {session.user.role === "OWNER" && <AuditExport csrfToken={session.csrfToken} filters={{ ...filters }} />}
      </div>
      <form className="mt-7 grid gap-3 md:grid-cols-3 xl:grid-cols-7">
        <Input name="actor" defaultValue={query.actor} maxLength={320} placeholder="Actor email" />
        <Input name="action" defaultValue={query.action} maxLength={100} placeholder="Action" />
        <Input name="entity" defaultValue={query.entity} maxLength={100} placeholder="Entity" />
        <select name="result" defaultValue={filters.result ?? ""} className="h-10 rounded-md border border-gt-border bg-gt-surface px-3 text-sm">
          <option value="">All results</option><option>SUCCESS</option><option>FAILURE</option><option>DENIED</option>
        </select>
        <Input name="from" type="date" defaultValue={query.from} aria-label="From date" />
        <Input name="to" type="date" defaultValue={query.to} aria-label="To date" />
        <Button type="submit">Filter</Button>
      </form>
      <div className="mt-7 overflow-x-auto rounded-lg border border-gt-border">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="bg-gt-surface text-xs uppercase tracking-wide text-gt-muted">
            <tr><th className="p-3">Time</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Entity</th><th className="p-3">Result</th><th className="p-3">Metadata</th></tr>
          </thead>
          <tbody>
            {result.items.map((row) => (
              <tr key={row.id} className="border-t border-gt-border align-top">
                <td className="p-3 text-xs text-gt-muted">{new Date(row.createdAt).toLocaleString()}</td>
                <td className="p-3"><div>{row.actorEmail || "System"}</div><div className="text-xs text-gt-muted">{row.actorRole || "—"}</div></td>
                <td className="p-3 font-mono text-xs">{row.action}</td>
                <td className="p-3"><div>{row.entity || "—"}</div><div className="max-w-48 truncate text-xs text-gt-muted">{row.entityId || ""}</div></td>
                <td className="p-3">{row.result}</td>
                <td className="max-w-80 p-3"><pre className="whitespace-pre-wrap break-words text-xs text-gt-muted">{row.metadata ? JSON.stringify(row.metadata, null, 2) : "—"}</pre></td>
              </tr>
            ))}
            {!result.items.length && <tr><td colSpan={6} className="p-10 text-center text-gt-muted">No audit records match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Pagination">
          <span className="text-gt-muted">Page {result.page} of {pages}</span>
          <div className="flex gap-2">
            {result.page > 1 && <Button asChild size="sm" variant="outline"><Link href={pageHref(query, result.page - 1)}>Previous</Link></Button>}
            {result.page < pages && <Button asChild size="sm" variant="outline"><Link href={pageHref(query, result.page + 1)}>Next</Link></Button>}
          </div>
        </nav>
      )}
    </section>
  );
}

function parseDate(value: string | undefined, end: boolean) {
  if (!value) return undefined;
  const time = Date.parse(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isFinite(time) ? time : undefined;
}
function pageHref(query: Query, page: number) {
  const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
  params.set("page", String(page));
  return `/admin/audit?${params}`;
}
