import { getAdminOverview } from "@/lib/admin/overview";
import type { FoundationTransaction } from "@/lib/admin/operations-data";

export const dynamic = "force-dynamic";

export default function AdminOverviewPage() {
  const overview = getAdminOverview();

  return (
    <section>
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-gt-emerald-bright">
        Administration
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-gt-fg">Overview</h1>
      <p className="mt-2 text-sm text-gt-muted">
        Live administrative, Foundation sale, session, login, and audit aggregates.
      </p>
      <OverviewSection title="Runtime controls" available={overview.runtime.available}>
        {overview.runtime.available && <>
          <SummaryCard label="Purchase mode" value={overview.runtime.value.purchaseMode} />
          <SummaryCard label="Emergency pause" value={overview.runtime.value.emergencyPaused ? "Enabled" : "Disabled"} />
        </>}
      </OverviewSection>
      <OverviewSection title="Foundation operations" available={overview.foundation.available}>
        {overview.foundation.available && <>
          <SummaryCard label="Quotes" value={overview.foundation.value.quotes} />
          {Object.entries(overview.foundation.value.states).map(([state, count]) => (
            <SummaryCard key={state} label={state} value={count} />
          ))}
          <SummaryCard label="Confirmed SOL" value={overview.foundation.value.confirmedSol} />
          <SummaryCard label="Confirmed GTREE" value={overview.foundation.value.confirmedGtree} />
          <TransactionCard label="Last successful quote" transaction={overview.foundation.value.latestSuccessfulQuote} />
          <TransactionCard label="Latest confirmed purchase / settlement" transaction={overview.foundation.value.latestConfirmed} />
          <TransactionCard label="Latest failed purchase" transaction={overview.foundation.value.latestFailed} showFailure />
        </>}
      </OverviewSection>
      <OverviewSection title="News" available={overview.news.available}>
        {overview.news.available && <>
          {Object.entries(overview.news.value.counts).map(([status, count]) => (
            <SummaryCard key={status} label={status} value={count} />
          ))}
          <DetailCard label="Latest published">
            {overview.news.value.latestPublished
              ? <><div>{overview.news.value.latestPublished.title}</div><div className="mt-1 text-xs text-gt-muted">{formatTime(overview.news.value.latestPublished.publishedAt)}</div></>
              : "No published news recorded"}
          </DetailCard>
        </>}
      </OverviewSection>
      <OverviewSection title="Partnerships" available={overview.partnerships.available}>
        {overview.partnerships.available && <>
          {Object.entries(overview.partnerships.value.counts).map(([status, count]) => (
            <SummaryCard key={status} label={status} value={count} />
          ))}
          <DetailCard label="Latest request">
            {overview.partnerships.value.latestRequest
              ? <><div>{overview.partnerships.value.latestRequest.organizationName}</div><div className="mt-1 text-xs text-gt-muted">{overview.partnerships.value.latestRequest.requestNumber} · {overview.partnerships.value.latestRequest.status} · {formatTime(overview.partnerships.value.latestRequest.submittedAt)}</div></>
              : "No partnership requests recorded"}
          </DetailCard>
        </>}
      </OverviewSection>
      <OverviewSection title="Access and security" available={overview.access.available}>
        {overview.access.available && <>
          <SummaryCard label="Active sessions" value={overview.access.value.activeSessions} />
          <DetailCard label="Latest successful login">
            {overview.access.value.latestSuccessfulLogin
              ? `${overview.access.value.latestSuccessfulLogin.email} · ${formatTime(overview.access.value.latestSuccessfulLogin.attemptedAt)}`
              : "No successful login recorded"}
          </DetailCard>
          <DetailCard label="Latest failed login">
            {overview.access.value.latestFailedLogin
              ? <><div>{overview.access.value.latestFailedLogin.email} · {formatTime(overview.access.value.latestFailedLogin.attemptedAt)}</div><div className="mt-1 text-xs text-gt-muted">{overview.access.value.latestFailedLogin.failureReason ?? "No failure reason recorded"}</div></>
              : "No failed login recorded"}
          </DetailCard>
          <DetailCard label="Latest audit actions">
            {overview.access.value.latestAuditActions.length
              ? <ul className="space-y-2">{overview.access.value.latestAuditActions.map((entry, index) => <li key={`${entry.createdAt}-${index}`}><span className="font-mono text-xs">{entry.action}</span><span className="text-xs text-gt-muted"> · {entry.result} · {formatTime(entry.createdAt)}</span></li>)}</ul>
              : "No audit actions recorded"}
          </DetailCard>
        </>}
      </OverviewSection>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">SQLite availability</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <SummaryCard label="Admin SQLite" value={overview.sqlite.admin.available
            ? `${overview.sqlite.admin.value.journalMode} · ${overview.sqlite.admin.value.busyTimeoutMs} ms`
            : "Unavailable"} />
          <SummaryCard label="Foundation SQLite" value={overview.sqlite.foundation.available
            ? `${overview.sqlite.foundation.value.journalMode} · ${overview.sqlite.foundation.value.busyTimeoutMs} ms`
            : "Unavailable"} />
        </div>
      </section>
    </section>
  );
}

function OverviewSection({ title, available, children }: { title: string; available: boolean; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      {available
        ? <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
        : <div className="mt-3 rounded-lg border border-gt-border bg-gt-charcoal/50 p-4 text-sm text-gt-muted">Unavailable</div>}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-gt-border bg-gt-charcoal/50 p-4">
      <p className="text-sm text-gt-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gt-fg">{value}</p>
    </div>
  );
}

function DetailCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gt-border bg-gt-charcoal/50 p-4">
      <p className="text-sm text-gt-muted">{label}</p>
      <div className="mt-2 text-sm text-gt-fg">{children}</div>
    </div>
  );
}

function TransactionCard({ label, transaction, showFailure = false }: {
  label: string;
  transaction: FoundationTransaction | null;
  showFailure?: boolean;
}) {
  return (
    <DetailCard label={label}>
      {transaction
        ? <>
            <div className="truncate font-mono text-xs">{transaction.quoteId}</div>
            <div className="mt-1 text-xs text-gt-muted">{transaction.state} · {formatTime(transaction.confirmedAt ?? transaction.failedAt ?? transaction.createdAt)}</div>
            <div className="mt-1 text-xs">{formatAtomic(transaction.inputLamports)} SOL · {formatAtomic(transaction.outputTokenUnits)} GTREE</div>
            {showFailure && <div className="mt-1 text-xs text-red-300">{transaction.failureReason ?? "No failure reason recorded"}</div>}
          </>
        : `No ${label.toLowerCase()} recorded`}
    </DetailCard>
  );
}

function formatTime(value: number) {
  return new Date(value).toLocaleString();
}

function formatAtomic(value: string) {
  if (!/^\d+$/.test(value)) return "Unavailable";
  const padded = value.padStart(10, "0");
  const fraction = padded.slice(-9).replace(/0+$/, "");
  return fraction ? `${padded.slice(0, -9)}.${fraction}` : padded.slice(0, -9);
}
