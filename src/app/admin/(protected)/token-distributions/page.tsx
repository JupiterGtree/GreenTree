import { redirect } from "next/navigation";
import { TokenDistributionAdmin } from "@/components/admin/token-distribution-admin";
import { getCurrentAdminSession } from "@/lib/admin/request";
import { TokenDistributionService } from "@/lib/admin/token-distributions";

export const dynamic = "force-dynamic";

export default async function TokenDistributionsPage() {
  const session = await getCurrentAdminSession();
  if (!session) redirect("/admin/login");
  const service = new TokenDistributionService();
  const [dashboard, list] = await Promise.all([
    service.dashboard(session.user),
    Promise.resolve(service.list({ pageSize: 25 }, session.user)),
  ]);
  return (
    <TokenDistributionAdmin
      csrfToken={session.csrfToken}
      dashboard={dashboard}
      list={list}
      categories={[...service.categories]}
      distributionTypes={[...service.distributionTypes]}
    />
  );
}
