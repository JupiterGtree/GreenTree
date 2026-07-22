import { redirect } from "next/navigation";
import { PurchaseControl } from "@/components/admin/purchase-control";
import { getCurrentAdminSession } from "@/lib/admin/request";
import { RuntimeSettingsService } from "@/lib/admin/runtime-settings";
import { PROJECT } from "@/lib/constants/project";

export const dynamic = "force-dynamic";

export default async function PurchaseControlPage() {
  const session = await getCurrentAdminSession();
  if (!session) redirect("/admin/login");
  const settings = new RuntimeSettingsService().list();
  const addresses = [
    { key: "gtreeMint", label: "GTREE mint", value: process.env.FOUNDATION_DIRECT_GTREE_MINT?.trim() || PROJECT.mint },
    { key: "treasuryRecipient", label: "Treasury recipient", value: address("FOUNDATION_DIRECT_TREASURY_RECIPIENT") },
    { key: "saleTokenAccount", label: "Sale token account", value: address("FOUNDATION_DIRECT_SALE_TOKEN_ACCOUNT") },
    { key: "saleSignerPublicKey", label: "Sale signer public key", value: address("FOUNDATION_DIRECT_SALE_SIGNER_PUBLIC_KEY") },
  ];
  return (
    <section>
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-gt-emerald-bright">Purchase operations</p>
      <h1 className="mt-2 text-3xl font-semibold">Purchase control</h1>
      <p className="mt-2 mb-7 text-sm text-gt-muted">
        Canonical non-secret runtime controls. Every change requires a reason and is audited.
      </p>
      <PurchaseControl
        settings={settings}
        addresses={addresses}
        csrfToken={session.csrfToken}
        canChangeNonSensitive={session.user.role === "OWNER" || session.user.role === "ADMIN"}
        canChangeSensitive={session.user.role === "OWNER"}
      />
    </section>
  );
}

function address(name: string): string | null {
  return process.env[name]?.trim() || null;
}
