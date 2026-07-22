import { BadgeCheck, Landmark, ScrollText, ShieldCheck } from "lucide-react";
import type { TransparencyRecord } from "@/types/transparency";

export function TransparencySummary({ records }: { records: TransparencyRecord[] }) {
  const onChain = records.filter((r) => r.verification === "verified-on-chain").length;
  const policies = records.filter((r) => r.sourceType === "policy").length;
  const reports = records.filter((r) => r.sourceType === "report").length;

  const items = [
    { icon: ShieldCheck, label: "Verified on-chain records", value: onChain },
    { icon: ScrollText, label: "Documented policies referenced", value: policies },
    { icon: Landmark, label: "Project reports published", value: reports },
    { icon: BadgeCheck, label: "Security incidents", value: "None published" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="glass-surface-b flex flex-col gap-2 rounded-lg px-4 py-3.5">
          <item.icon className="size-4 text-gt-emerald-bright" aria-hidden />
          <span className="tabular text-xl font-semibold text-gt-offwhite">{item.value}</span>
          <span className="text-xs text-gt-muted">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
