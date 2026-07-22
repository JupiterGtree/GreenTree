import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Target, Users } from "lucide-react";
import { DEMO_MISSIONS, getMissionBySlug } from "@/lib/data/mock-missions";
import { MissionStatusBadge } from "@/components/shared/status-badge";
import { CATEGORY_LABELS } from "@/features/missions/mission-category";
import { MissionTimeline } from "@/features/missions/mission-timeline";
import { MissionEvidence } from "@/features/missions/mission-evidence";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatUsd } from "@/lib/formatters/number";
import { getSiteContent } from "@/lib/admin/site-content";

export function generateStaticParams() {
  return DEMO_MISSIONS.map((mission) => ({ slug: mission.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  if (!getSiteContent().environmentalMissionsEnabled) {
    return { title: "Environmental missions — Foundation phase" };
  }
  const { slug } = await params;
  const mission = getMissionBySlug(slug);
  if (!mission) return { title: "Mission not found" };
  return { title: mission.title, description: mission.objective };
}

export default async function MissionDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!getSiteContent().environmentalMissionsEnabled) notFound();
  const { slug } = await params;
  const mission = getMissionBySlug(slug);
  if (!mission) notFound();

  return (
    <div className="pb-20">
      <section className="border-b border-gt-border bg-gt-charcoal-2/60">
        <div className="container-gt py-10 sm:py-12">
          <Link href="/missions" className="inline-flex items-center gap-1.5 text-sm text-gt-muted transition-colors hover:text-gt-emerald-bright">
            <ArrowLeft className="size-4" aria-hidden />
            All missions
          </Link>

          <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-gt-emerald-bright">
                {CATEGORY_LABELS[mission.category]}
              </span>
              <h1 className="mt-1 font-display text-3xl font-semibold text-gt-offwhite sm:text-4xl">{mission.title}</h1>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-gt-muted">
                <MapPin className="size-4" aria-hidden />
                {mission.location}
              </p>
            </div>
            <MissionStatusBadge status={mission.status} />
          </div>

          {mission.isExample && (
            <Badge variant="gold" className="mt-4">
              Example mission record · not a real funded mission
            </Badge>
          )}
        </div>
      </section>

      <section className="container-gt py-10 sm:py-12">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-8">
            <div>
              <h2 className="font-display text-xl font-semibold text-gt-offwhite">Environmental problem</h2>
              <p className="mt-2 text-sm leading-relaxed text-gt-muted">{mission.problem}</p>
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold text-gt-offwhite">Objective</h2>
              <p className="mt-2 text-sm leading-relaxed text-gt-muted">{mission.objective}</p>
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold text-gt-offwhite">Measurable outputs</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-gt-border bg-gt-surface px-4 py-3">
                  <p className="text-xs font-medium text-gt-muted">Target</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-gt-fg">
                    <Target className="size-3.5 text-gt-emerald-bright" aria-hidden />
                    {mission.measurableTarget}
                  </p>
                </div>
                <div className="rounded-lg border border-gt-border bg-gt-surface px-4 py-3">
                  <p className="text-xs font-medium text-gt-muted">Progress</p>
                  <p className="mt-1 text-sm font-semibold text-gt-fg">{mission.measurableProgress}</p>
                </div>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gt-surface-3">
                <div className="h-full rounded-full bg-gt-emerald-bright transition-all" style={{ width: `${mission.completionPct}%` }} />
              </div>
              <p className="mt-1 text-xs text-gt-muted-2">{mission.completionPct}% complete</p>
            </div>

            <div>
              <h2 className="font-display text-xl font-semibold text-gt-offwhite">Payment milestones</h2>
              <div className="glass-surface-b mt-3 rounded-lg p-5">
                <MissionTimeline milestones={mission.milestones} />
              </div>
            </div>

            <div>
              <h2 className="font-display text-xl font-semibold text-gt-offwhite">Evidence</h2>
              <div className="mt-3">
                <MissionEvidence evidence={mission.evidence} />
              </div>
            </div>

            {mission.outcomeReport && (
              <div>
                <h2 className="font-display text-xl font-semibold text-gt-offwhite">Outcome report</h2>
                <p className="mt-2 text-sm leading-relaxed text-gt-muted">{mission.outcomeReport}</p>
              </div>
            )}

            {mission.verificationNotes && (
              <div className="rounded-lg border border-gt-info/30 bg-gt-info/5 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gt-info">Verification notes</p>
                <p className="mt-1 text-sm text-gt-muted">{mission.verificationNotes}</p>
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="glass-surface-b rounded-lg p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gt-muted">Executor / local partner</h3>
              <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-gt-fg">
                <Users className="size-4 text-gt-emerald-bright" aria-hidden />
                {mission.executor}
              </p>
            </div>

            <div className="glass-surface-b rounded-lg p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gt-muted">Budget</h3>
              <dl className="mt-3 flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-gt-muted">Approved budget</dt>
                  <dd className="tabular font-semibold text-gt-fg">{formatUsd(mission.approvedBudgetUsd, { compact: true })}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-gt-muted">Paid to date</dt>
                  <dd className="tabular font-semibold text-gt-fg">{formatUsd(mission.paidUsd, { compact: true })}</dd>
                </div>
              </dl>
            </div>

            <div className="glass-surface-b rounded-lg p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gt-muted">Timeline</h3>
              <dl className="mt-3 flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-gt-muted">Start</dt>
                  <dd className="font-medium text-gt-fg">{formatDate(mission.timelineStart)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-gt-muted">Expected end</dt>
                  <dd className="font-medium text-gt-fg">{formatDate(mission.timelineEnd)}</dd>
                </div>
              </dl>
            </div>

            <div className="glass-surface-b rounded-lg p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gt-muted">Verification</h3>
              <p className="mt-2 text-sm text-gt-fg">
                {mission.verified ? "Evidence reviewed and considered verified for this stage." : "Evidence collection is ongoing; not yet fully verified."}
              </p>
              <p className="mt-1 text-xs text-gt-muted-2">{mission.evidenceCount} evidence items published</p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
