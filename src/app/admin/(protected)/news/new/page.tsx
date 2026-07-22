import { redirect } from "next/navigation";
import { NewsEditor } from "@/components/admin/news-editor";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/request";

export const dynamic = "force-dynamic";

export default async function NewNewsPage() {
  const session = await getCurrentAdminSession();
  if (!session) redirect("/admin/login");
  if (!hasAdminPermission(session.user.role, "news.write")) redirect("/admin/news");
  return (
    <section>
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-gt-emerald-bright">Publishing</p>
      <h1 className="mt-2 text-3xl font-semibold">New news post</h1>
      <div className="mt-8"><NewsEditor csrfToken={session.csrfToken} canWrite /></div>
    </section>
  );
}
