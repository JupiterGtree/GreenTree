import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PartnershipActions } from "@/components/admin/partnership-actions";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/request";
import { getPartnershipRepository } from "@/lib/partnerships/repository";

export const dynamic = "force-dynamic";

export default async function PartnershipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentAdminSession();
  if (!session) redirect("/admin/login");
  if (!hasAdminPermission(session.user.role, "partnerships.read")) redirect("/admin");
  const repository = getPartnershipRepository();
  const request = repository.findById((await params).id);
  if (!request) notFound();
  const timeline = repository.timeline(request.id);
  const notes = repository.notes(request.id);
  const canManage = hasAdminPermission(session.user.role, "partnerships.write");

  return (
    <section>
      <Link href="/admin/partnerships" className="text-sm text-gt-emerald-bright">← Partnerships</Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-gt-info">{request.category}</p>
          <h1 className="mt-2 text-3xl font-semibold">{request.requestNumber}</h1>
          <p className="mt-2 text-sm text-gt-muted">
            Submitted {new Date(request.submittedAt).toLocaleString()} · {request.status}
            {request.unread ? " · Unread" : ""}
          </p>
        </div>
        <span className="rounded-full border border-gt-border px-3 py-1 text-xs">{request.status}</span>
      </div>

      <div className="mt-8 grid gap-7 xl:grid-cols-[1fr_360px]">
        <div className="space-y-7">
          <article className="rounded-lg border border-gt-border bg-gt-surface/45 p-5">
            <h2 className="text-lg font-semibold">Submitted proposal</h2>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2">
              <Item label="Name / project" value={request.organizationName || request.applicantName} />
              <Item label="Category" value={request.category} />
              <Item label="Preferred contact" value={request.preferredContactType} />
              <Item label="Normalized contact" value={request.normalizedContact} />
              <Item label="Duplicate status" value={request.duplicateOf ? "Related duplicate" : "Original request"} />
              <Item label="Website" value={request.website} href={request.website} />
            </dl>
            <div className="mt-6 border-t border-gt-border pt-5">
              {request.introduction && (
                <>
                  <h3 className="text-xs uppercase tracking-wide text-gt-muted">Legacy introduction</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{request.introduction}</p>
                </>
              )}
              <h3 className={`${request.introduction ? "mt-6 " : ""}text-xs uppercase tracking-wide text-gt-muted`}>Proposal</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{request.collaboration}</p>
              {(request.email || request.xHandle || request.telegramHandle) && (
                <div className="mt-6 grid gap-4 border-t border-gt-border pt-5 sm:grid-cols-3">
                  <Item label="Email" value={request.email} href={request.email ? `mailto:${request.email}` : null} />
                  <Item label="X" value={request.xHandle ? `@${request.xHandle}` : null} href={request.xHandle ? `https://x.com/${request.xHandle}` : null} />
                  <Item label="Telegram" value={request.telegramHandle ? `@${request.telegramHandle}` : null} href={request.telegramHandle ? `https://t.me/${request.telegramHandle}` : null} />
                </div>
              )}
            </div>
            {request.duplicateOf && (
              <p className="mt-5 border-t border-gt-border pt-4 text-sm text-amber-200">
                Related to an earlier request: <Link href={`/admin/partnerships/${request.duplicateOf}`} className="underline">open relationship</Link>
              </p>
            )}
          </article>

          <section>
            <h2 className="text-lg font-semibold">Internal notes</h2>
            <div className="mt-3 space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="rounded-lg border border-gt-border bg-gt-surface/35 p-4">
                  <p className="whitespace-pre-wrap text-sm leading-6">{note.body}</p>
                  <p className="mt-3 text-xs text-gt-muted">{note.authorEmail ?? "Former administrator"} · {new Date(note.createdAt).toLocaleString()}</p>
                </div>
              ))}
              {!notes.length && <p className="rounded-lg border border-dashed border-gt-border p-5 text-sm text-gt-muted">No internal notes.</p>}
            </div>
          </section>
        </div>

        <aside className="space-y-7">
          {canManage && (
            <section className="rounded-lg border border-gt-border bg-gt-surface/45 p-5">
              <h2 className="mb-5 text-lg font-semibold">Manage request</h2>
              <PartnershipActions
                id={request.id}
                status={request.status}
                assignedUserId={request.assignedUserId}
                allowResubmission={request.allowResubmission}
                unread={request.unread}
                contactData={request.normalizedContact ?? "No contact available"}
                contactHref={preferredContactHref(request)}
                admins={repository.activeAdmins()}
                csrfToken={session.csrfToken}
              />
            </section>
          )}
          <section>
            <h2 className="text-lg font-semibold">Timeline</h2>
            <ol className="mt-4 border-l border-gt-border pl-5">
              {timeline.map((event) => (
                <li key={event.id} className="relative pb-5 text-sm">
                  <span className="absolute -left-[23px] top-1 size-2 rounded-full bg-gt-info" />
                  <p className="font-medium">{event.eventType.replaceAll("_", " ")}</p>
                  {(event.fromStatus || event.toStatus) && <p className="text-gt-muted">{event.fromStatus ?? "—"} → {event.toStatus ?? "—"}</p>}
                  <p className="mt-1 text-xs text-gt-muted">{event.actorEmail ?? "Public submission"} · {new Date(event.createdAt).toLocaleString()}</p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </section>
  );
}

function Item({ label, value, href }: { label: string; value: string | null; href?: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gt-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm">
        {href && value ? <a href={href} target={href.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer" className="text-gt-emerald-bright hover:underline">{value}</a> : value || "—"}
      </dd>
    </div>
  );
}

function preferredContactHref(request: {
  preferredContactType: "X" | "TELEGRAM" | "EMAIL" | "MULTIPLE" | null;
  xHandle: string | null;
  telegramHandle: string | null;
  email: string | null;
}) {
  if (request.preferredContactType === "X" && request.xHandle) return `https://x.com/${request.xHandle}`;
  if (request.preferredContactType === "TELEGRAM" && request.telegramHandle) return `https://t.me/${request.telegramHandle}`;
  if (request.preferredContactType === "EMAIL" && request.email) return `mailto:${request.email}`;
  if (request.xHandle) return `https://x.com/${request.xHandle}`;
  if (request.telegramHandle) return `https://t.me/${request.telegramHandle}`;
  return request.email ? `mailto:${request.email}` : null;
}
