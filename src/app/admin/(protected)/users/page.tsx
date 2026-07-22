import { redirect } from "next/navigation";
import { UserManagement } from "@/components/admin/user-management";
import { getCurrentAdminSession } from "@/lib/admin/request";
import { AdminUserService } from "@/lib/admin/users";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getCurrentAdminSession();
  if (!session) redirect("/admin/login");
  if (session.user.role !== "OWNER") redirect("/admin");
  const users = new AdminUserService().list(session.user);
  return (
    <section>
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-gt-emerald-bright">Access control</p>
      <h1 className="mt-2 text-3xl font-semibold">Admin users</h1>
      <p className="mt-2 mb-7 text-sm text-gt-muted">Manage real administrator accounts, roles, status, credentials, and sessions.</p>
      <UserManagement users={users} csrfToken={session.csrfToken} />
    </section>
  );
}
