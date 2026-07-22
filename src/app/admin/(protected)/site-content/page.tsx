import { redirect } from "next/navigation";
import { SiteContentEditor } from "@/components/admin/site-content-editor";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/request";
import { SiteContentService } from "@/lib/admin/site-content";
import { getNewsRepository } from "@/lib/news/repository";

export const dynamic = "force-dynamic";

export default async function SiteContentPage() {
  const session = await getCurrentAdminSession();
  if (!session) redirect("/admin/login");
  if (!hasAdminPermission(session.user.role, "admin.settings.manage")) redirect("/admin");

  const settings = new SiteContentService().get();
  const news = getNewsRepository().listVisible({ limit: 50 }).map(({ id, title }) => ({ id, title }));

  return (
    <section className="max-w-4xl">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-gt-emerald-bright">
        Publishing
      </p>
      <h1 className="mt-2 text-3xl font-semibold">Site Content</h1>
      <p className="mb-7 mt-2 text-sm text-gt-muted">
        Controls shown here are validated, database-backed, immediately applied to public pages, and audited.
      </p>
      <SiteContentEditor initial={settings} news={news} csrfToken={session.csrfToken} />
    </section>
  );
}
