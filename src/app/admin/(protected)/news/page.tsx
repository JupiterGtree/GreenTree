import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/request";
import { getNewsRepository, type NewsStatus } from "@/lib/news/repository";

export const dynamic = "force-dynamic";

const STATUSES: NewsStatus[] = ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"];

export default async function AdminNewsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; category?: string; page?: string }>;
}) {
  const session = await getCurrentAdminSession();
  if (!session) redirect("/admin/login");
  const filters = await searchParams;
  const status = STATUSES.includes(filters.status as NewsStatus) ? filters.status as NewsStatus : undefined;
  const page = Math.max(Number(filters.page) || 1, 1);
  const result = getNewsRepository().listAdminPage({
    query: filters.q,
    status,
    category: filters.category,
    page,
    pageSize: 25,
  });
  const pages = Math.max(Math.ceil(result.total / result.pageSize), 1);
  const canWrite = hasAdminPermission(session.user.role, "news.write");

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-gt-emerald-bright">Publishing</p>
          <h1 className="mt-2 text-3xl font-semibold">News</h1>
          <p className="mt-2 text-sm text-gt-muted">Search, filter and manage official updates.</p>
        </div>
        {canWrite && <Button asChild><Link href="/admin/news/new">New post</Link></Button>}
      </div>
      <form className="mt-7 grid gap-3 sm:grid-cols-[1fr_180px_180px_auto]">
        <Input name="q" defaultValue={filters.q} placeholder="Search news…" aria-label="Search news" />
        <select name="status" defaultValue={status ?? ""} className="rounded-md border border-gt-border bg-gt-surface px-3 text-sm">
          <option value="">All statuses</option>
          {STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <Input name="category" defaultValue={filters.category} placeholder="Category slug" aria-label="News category" />
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      <div className="mt-7 overflow-x-auto rounded-lg border border-gt-border">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-gt-surface text-xs uppercase tracking-wide text-gt-muted">
            <tr><th className="p-3">Title</th><th className="p-3">Status</th><th className="p-3">Category</th><th className="p-3">Updated</th></tr>
          </thead>
          <tbody>
            {result.items.map((post) => (
              <tr key={post.id} className="border-t border-gt-border">
                <td className="p-3"><Link href={`/admin/news/${post.id}`} className="font-medium text-gt-emerald-bright">{post.title}</Link><div className="mt-1 text-xs text-gt-muted">/{post.slug}</div></td>
                <td className="p-3">{post.status}</td>
                <td className="p-3 text-gt-muted">{post.category ?? "—"}</td>
                <td className="p-3 text-gt-muted">{new Date(post.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
            {!result.items.length && <tr><td colSpan={4} className="p-8 text-center text-gt-muted">No matching posts.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Pagination">
          <span className="text-gt-muted">Page {page} of {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Button asChild size="sm" variant="outline"><Link href={pageHref(filters, page - 1)}>Previous</Link></Button>}
            {page < pages && <Button asChild size="sm" variant="outline"><Link href={pageHref(filters, page + 1)}>Next</Link></Button>}
          </div>
        </nav>
      )}
    </section>
  );
}

function pageHref(filters: { q?: string; status?: string; category?: string }, page: number) {
  const params = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  params.set("page", String(page));
  return `/admin/news?${params}`;
}
