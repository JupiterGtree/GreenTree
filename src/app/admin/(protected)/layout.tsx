import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/request";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentAdminSession();
  if (!session) redirect("/admin/login");

  return (
    <AdminShell
      identity={session.user.displayName || session.user.email}
      role={session.user.role}
      csrfToken={session.csrfToken}
      permissions={{
        partnerships: hasAdminPermission(session.user.role, "partnerships.read"),
        support: hasAdminPermission(session.user.role, "support.read"),
        settings: hasAdminPermission(session.user.role, "admin.settings.manage"),
        audit: hasAdminPermission(session.user.role, "audit.read"),
        users: hasAdminPermission(session.user.role, "admin.users.manage"),
      }}
    >
      {children}
    </AdminShell>
  );
}
