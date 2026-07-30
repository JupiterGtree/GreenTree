import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { NewsEditor } from "@/components/admin/news-editor";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/request";
import { getNewsRepository, type NewsHistoryEntry, type NewsPost } from "@/lib/news/repository";

export const dynamic = "force-dynamic";

export default async function EditNewsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentAdminSession();
  if (!session) redirect("/admin/login");
  const repository = getNewsRepository();
  const id = (await params).id;
  let post: NewsPost | null;
  try {
    post = repository.findById(id);
  } catch (error) {
    console.error("[admin/news] Failed to load news post", { id, error });
    throw new Error("Unable to load this news post.");
  }
  if (!post) notFound();
  let history: NewsHistoryEntry[] = [];
  try {
    history = repository.history(post.id);
  } catch (error) {
    console.error("[admin/news] Failed to load news history", { id: post.id, error });
  }
  const canWrite = hasAdminPermission(session.user.role, "news.write");
  let publiclyVisible = false;
  try {
    publiclyVisible = Boolean(repository.findVisibleBySlug(post.slug));
  } catch (error) {
    console.error("[admin/news] Failed to resolve public visibility", { id: post.id, error });
  }
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-gt-emerald-bright">Publishing</p>
          <h1 className="mt-2 text-3xl font-semibold">{canWrite ? "Edit news post" : "View news post"}</h1>
        </div>
        {publiclyVisible && (
          <Link href={`/news/${post.slug}`} target="_blank" className="text-sm text-gt-emerald-bright">Open public article ↗</Link>
        )}
      </div>
      <div className="mt-8"><NewsEditor post={post} csrfToken={session.csrfToken} canWrite={canWrite} /></div>
      <section className="mt-10 border-t border-gt-border pt-7">
        <h2 className="text-lg font-semibold">Change history</h2>
        <ol className="mt-4 space-y-3">
          {history.map((entry) => (
            <li key={entry.id} className="rounded-md border border-gt-border bg-gt-surface/35 p-4 text-sm">
              <span className="font-medium">{entry.action.replaceAll("_", " ")}</span>
              <span className="text-gt-muted"> · {entry.actorEmail ?? "Former administrator"} · {new Date(entry.createdAt).toLocaleString()}</span>
              <div className="mt-1 text-xs text-gt-muted">
                {entry.snapshot.status} · /{entry.snapshot.slug}
              </div>
            </li>
          ))}
          {!history.length && <li className="text-sm text-gt-muted">No recorded history is available for this legacy post.</li>}
        </ol>
      </section>
    </section>
  );
}
