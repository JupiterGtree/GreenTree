import { redirect } from "next/navigation";
import { AdminLoginForm } from "./login-form";
import { getCurrentAdminSession } from "@/lib/admin/request";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await getCurrentAdminSession()) redirect("/admin");

  return (
    <section className="mx-auto flex min-h-[70vh] w-full max-w-md items-center px-5 py-16">
      <div className="w-full rounded-xl border border-gt-border bg-gt-surface/80 p-6 shadow-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-gt-emerald-bright">
          Restricted access
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-gt-fg">Admin sign in</h1>
        <p className="mb-7 mt-2 text-sm text-gt-muted">
          Use an authorized Green Tree administration account.
        </p>
        <AdminLoginForm />
      </div>
    </section>
  );
}
