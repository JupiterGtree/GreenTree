import { redirect } from "next/navigation";
import { getCurrentAdminSession } from "@/lib/admin/request";
import { getSystemHealth } from "@/lib/admin/system-health";
import { buildSystemHealthPageModel } from "./system-health-model";
import { SystemHealthPanel } from "./system-health-panel";

export const dynamic = "force-dynamic";

export default async function AdminSystemPage() {
  const session = await getCurrentAdminSession();
  if (!session) redirect("/admin/login");
  const health = await getSystemHealth();
  const model = buildSystemHealthPageModel(health.checkedAt, health.checks);
  return (
    <section>
      <SystemHealthPanel checkedAt={model.checkedAt} checks={model.checks} summary={model.summary} />
    </section>
  );
}
