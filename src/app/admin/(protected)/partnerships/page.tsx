import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/request";
import {
  PARTNERSHIP_CATEGORIES, PARTNERSHIP_STATUSES, getPartnershipRepository,
  type PartnershipCategory, type PartnershipStatus,
} from "@/lib/partnerships/repository";

export const dynamic = "force-dynamic";

interface Filters {
  q?: string; status?: string; category?: string; from?: string; to?: string;
  sort?: string; page?: string;
}

export default async function AdminPartnershipsPage({
  searchParams,
}: { searchParams: Promise<Filters> }) {
  const session = await getCurrentAdminSession();
  if (!session) redirect("/admin/login");
  if (!hasAdminPermission(session.user.role, "partnerships.read")) redirect("/admin");
  const query = await searchParams;
  const status = PARTNERSHIP_STATUSES.includes(query.status as PartnershipStatus)
    ? query.status as PartnershipStatus : undefined;
  const category = PARTNERSHIP_CATEGORIES.includes(query.category as PartnershipCategory)
    ? query.category as PartnershipCategory : undefined;
  const page = Math.max(Number(query.page) || 1, 1);
  const result = getPartnershipRepository().list({
    query: query.q, status, category,
    from: query.from ? Date.parse(`${query.from}T00:00:00Z`) : undefined,
    to: query.to ? Date.parse(`${query.to}T23:59:59.999Z`) : undefined,
    sort: query.sort === "oldest" ? "oldest" : "newest",
    page, pageSize: 25,
  });
  const canManage = hasAdminPermission(session.user.role, "partnerships.write");
  const exportParams = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
  exportParams.set("format", "csv");
  const pages = Math.max(Math.ceil(result.total / result.pageSize), 1);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-gt-emerald-bright">Relationship intake</p>
          <h1 className="mt-2 text-3xl font-semibold">Partnerships</h1>
          <p className="mt-2 text-sm text-gt-muted">{result.total} real request{result.total === 1 ? "" : "s"}.</p>
        </div>
        {canManage && <Button asChild variant="outline"><a href={`/admin/api/partnerships?${exportParams}`}>Export CSV</a></Button>}
      </div>
      <form className="mt-7 grid gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Input name="q" defaultValue={query.q} placeholder="Number, name, contact, website or proposal" className="md:col-span-2" />
        <select name="status" defaultValue={status ?? ""} className="rounded-md border border-gt-border bg-gt-surface px-3 text-sm">
          <option value="">All statuses</option>
          {PARTNERSHIP_STATUSES.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select name="category" defaultValue={category ?? ""} className="rounded-md border border-gt-border bg-gt-surface px-3 text-sm">
          <option value="">All categories</option>
          {PARTNERSHIP_CATEGORIES.map((value) => <option key={value}>{value}</option>)}
        </select>
        <Input name="from" type="date" defaultValue={query.from} aria-label="From date" />
        <Input name="to" type="date" defaultValue={query.to} aria-label="To date" />
        <div className="flex gap-2">
          <select name="sort" defaultValue={query.sort ?? "newest"} className="min-w-0 flex-1 rounded-md border border-gt-border bg-gt-surface px-2 text-sm">
            <option value="newest">Newest</option><option value="oldest">Oldest</option>
          </select>
          <Button type="submit">Filter</Button>
        </div>
      </form>
      <div className="mt-7 overflow-x-auto rounded-lg border border-gt-border">
        <table className="w-full min-w-[840px] text-left text-sm">
          <thead className="bg-gt-surface text-xs uppercase tracking-wide text-gt-muted">
            <tr>
              <th className="p-3">Request</th><th className="p-3">Organization</th>
              <th className="p-3">Category</th><th className="p-3">Status</th>
              <th className="p-3">Contact</th><th className="p-3">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((item) => (
              <tr key={item.id} className="border-t border-gt-border align-top hover:bg-gt-surface/40">
                <td className="p-3">
                  <Link href={`/admin/partnerships/${item.id}`} className="font-medium text-gt-emerald-bright">
                    {item.unread && <span className="mr-2 inline-block size-2 rounded-full bg-gt-info" aria-label="Unread" />}
                    {item.requestNumber}
                  </Link>
                  {item.duplicateOf && <div className="mt-1 text-xs text-amber-300">Related resubmission</div>}
                </td>
                <td className="p-3"><div className="font-medium">{item.organizationName}</div><div className="text-xs text-gt-muted">{item.applicantName}</div></td>
                <td className="p-3 text-gt-muted">{item.category}</td>
                <td className="p-3">{item.status}</td>
                <td className="p-3 text-xs text-gt-muted">{item.normalizedContact ?? "—"}</td>
                <td className="p-3 text-gt-muted">{new Date(item.submittedAt).toLocaleString()}</td>
              </tr>
            ))}
            {!result.items.length && <tr><td colSpan={6} className="p-10 text-center text-gt-muted">No partnership requests have been received.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Pagination">
          <span className="text-gt-muted">Page {page} of {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Button asChild size="sm" variant="outline"><Link href={pageHref(query, page - 1)}>Previous</Link></Button>}
            {page < pages && <Button asChild size="sm" variant="outline"><Link href={pageHref(query, page + 1)}>Next</Link></Button>}
          </div>
        </nav>
      )}
    </section>
  );
}

function pageHref(filters: Filters, page: number) {
  const params = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])));
  params.set("page", String(page));
  return `/admin/partnerships?${params}`;
}
