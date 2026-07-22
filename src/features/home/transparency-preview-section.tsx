import Link from "next/link";
import {
  CircleCheckBig,
  FileCheck2,
  Landmark,
  ShieldCheck,
  ShieldQuestion,
  Waves,
} from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { RelativeTime } from "@/components/shared/relative-time";
import { getTransparencyRecords } from "@/data/transparency/get-transparency-records";
import { FadeIn } from "@/components/shared/fade-in";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SignalTone = "verified" | "published" | "quiet" | "unavailable";

const TONE_CLASS: Record<SignalTone, string> = {
  verified: "text-gt-emerald-bright",
  published: "text-gt-info",
  quiet: "text-gt-muted",
  unavailable: "text-gt-warning",
};

export async function TransparencyPreviewSection() {
  const result = await getTransparencyRecords();
  const records = result.data ?? [];
  const authoritiesVerified = records.some(
    (record) => record.category === "authorities" && record.verification === "verified-on-chain",
  );
  const liquidityPublished = records.some(
    (record) => record.category === "liquidity" && record.verification === "documented-policy",
  );
  const reportsPublished = records.some((record) => record.sourceType === "report");
  const securityReportPublished = records.some(
    (record) => record.category === "security" && record.sourceType === "report",
  );

  const categories = [
    {
      label: "Token authorities",
      detail: authoritiesVerified ? "Verified on-chain" : "Data unavailable",
      tone: authoritiesVerified ? "verified" : "unavailable",
      icon: ShieldCheck,
    },
    {
      label: "Treasury control",
      detail: "Project-published",
      tone: "published",
      icon: Landmark,
    },
    {
      label: "Liquidity records",
      detail: liquidityPublished ? "Policy published" : "No record published",
      tone: liquidityPublished ? "published" : "quiet",
      icon: Waves,
    },
    {
      label: "Project reports",
      detail: reportsPublished ? "Reports published" : "No report published",
      tone: reportsPublished ? "published" : "quiet",
      icon: FileCheck2,
    },
    {
      label: "Security reporting",
      detail: securityReportPublished ? "Report published" : "No report published",
      tone: securityReportPublished ? "published" : "quiet",
      icon: ShieldQuestion,
    },
  ] satisfies Array<{
    label: string;
    detail: string;
    tone: SignalTone;
    icon: typeof ShieldCheck;
  }>;

  return (
    <section className="relative overflow-hidden border-t border-gt-border-soft bg-gt-charcoal-2/55 py-20 sm:py-24 lg:py-28">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_70%_35%,rgba(32,178,170,0.09),transparent_62%)]" />
      <div className="container-gt relative">
        <FadeIn className="grid items-center gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20">
          <div className="max-w-xl">
            <SectionHeading
              eyebrow="Transparency Preview"
              title="Accountability, without the theatre."
              description="Green Tree separates independently verifiable token facts from project-published policy and reports. When a source is unavailable, the interface says so plainly."
            />
            <Button variant="outline" asChild className="mt-7">
              <Link href="/transparency">Open Transparency Center</Link>
            </Button>
          </div>

          <div className="glass-surface-b rounded-lg px-5 py-2 sm:px-7">
            <div className="flex flex-col gap-3 border-b border-gt-border-soft py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-gt-emerald/10 text-gt-emerald-bright">
                  <CircleCheckBig className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-gt-offwhite">Current verification signal</p>
                  <p className="mt-1 text-sm text-gt-muted">
                    {authoritiesVerified
                      ? "GTREE token controls were read from Solana Mainnet."
                      : "On-chain verification is temporarily unavailable."}
                  </p>
                </div>
              </div>
              <div className="pl-12 text-xs text-gt-muted-2 sm:pl-0 sm:text-right">
                <p className={authoritiesVerified ? "text-gt-emerald-bright" : "text-gt-warning"}>
                  {authoritiesVerified ? "Verified on-chain" : "Data unavailable"}
                </p>
                {result.fetchedAt && <p className="mt-1">Updated <RelativeTime iso={result.fetchedAt} /></p>}
              </div>
            </div>

            <ul aria-label="Transparency categories" className="divide-y divide-gt-border-soft">
              {categories.map((item) => (
                <li key={item.label} className="flex items-center justify-between gap-4 py-4">
                  <span className="flex min-w-0 items-center gap-3 text-sm text-gt-fg">
                    <item.icon className="size-4 shrink-0 text-gt-muted-2" aria-hidden />
                    {item.label}
                  </span>
                  <span className={cn("shrink-0 text-right text-xs font-medium", TONE_CLASS[item.tone])}>
                    {item.detail}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
