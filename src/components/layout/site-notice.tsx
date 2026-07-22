import { AlertTriangle, Info } from "lucide-react";
import { getSiteContent } from "@/lib/admin/site-content";

export function SiteNotice() {
  const { banner } = getSiteContent();
  if (!banner.enabled || !banner.message) return null;
  const maintenance = banner.tone === "MAINTENANCE";
  const Icon = maintenance ? AlertTriangle : Info;
  return (
    <aside
      aria-label={maintenance ? "Maintenance notice" : "Site notice"}
      className={maintenance
        ? "border-b border-gt-warning/40 bg-gt-warning/10 text-gt-fg"
        : "border-b border-gt-info/35 bg-gt-info/10 text-gt-fg"}
    >
      <div className="container-gt flex items-start justify-center gap-2 py-2.5 text-center text-sm">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>{banner.message}</p>
      </div>
    </aside>
  );
}
