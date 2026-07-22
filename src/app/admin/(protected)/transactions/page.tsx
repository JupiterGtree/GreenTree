import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/shared/copy-button";
import { getMarketSnapshot } from "@/data/market/get-market-snapshot";
import {
  getFoundationTransactions,
  type FoundationTransactionView,
} from "@/lib/admin/operations-data";
import { getCurrentAdminSession } from "@/lib/admin/request";
import { ENV } from "@/lib/constants/env";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/constants/project";

export const dynamic = "force-dynamic";

interface Query { view?: string; query?: string; from?: string; to?: string; page?: string }
const VIEWS: Array<{ value: FoundationTransactionView; label: string }> = [
  { value: "SALES", label: "Sales" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "PENDING", label: "Pending" },
  { value: "FAILED", label: "Failed" },
  { value: "EXPIRED", label: "Expired" },
  { value: "ALL", label: "All operational" },
];

export default async function AdminTransactionsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const session = await getCurrentAdminSession();
  if (!session) redirect("/admin/login");
  const query = await searchParams;
  const view = VIEWS.some((item) => item.value === query.view) ? query.view as FoundationTransactionView : "SALES";
  const market = await getMarketSnapshot();
  const currentSolUsd = market.status === "ready"
    && !market.stale
    && market.data?.sourceStatus === "LIVE"
    ? market.data.solUsd
    : null;
  const result = getFoundationTransactions({
    view,
    query: query.query,
    from: parseDate(query.from, false),
    to: parseDate(query.to, true),
    page: Math.max(Number(query.page) || 1, 1),
    pageSize: 25,
    currentSolUsd,
  });
  return (
    <section>
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-gt-emerald-bright">Foundation sale ledger</p>
      <h1 className="mt-2 text-3xl font-semibold">Foundation sales</h1>
      <p className="mt-2 text-sm text-gt-muted">Read-only purchase and settlement records. Revenue totals include confirmed sales only.</p>
      {!result.available ? (
        <div className="mt-7 rounded-lg border border-gt-border bg-gt-charcoal/40 p-8">
          <h2 className="font-semibold">Unavailable</h2>
          <p className="mt-2 text-sm text-gt-muted">The Foundation quote database is missing or unreadable.</p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Total Sales in SOL" value={`${formatAtomic(result.summary.confirmedInputLamports, 9)} SOL`} raw={`${result.summary.confirmedInputLamports} raw lamports · confirmed only`} />
            <SummaryCard label={`Sales Value in USD · ${result.summary.usdLabel}`} value={result.summary.confirmedUsd === null ? "Unavailable" : `$${result.summary.confirmedUsd}`} raw={result.summary.usdLabel === "Estimated" ? "Estimate using current validated SOL/USD where historical valuation is absent" : "Confirmed sales only"} />
            <SummaryCard label="Total GTREE Sold" value={`${formatAtomic(result.summary.confirmedOutputTokenUnits, 9)} GTREE`} raw={`${result.summary.confirmedOutputTokenUnits} raw units · confirmed only`} />
            <SummaryCard label="Unique Buyers" value={String(result.summary.uniqueConfirmedBuyers)} raw={`${result.summary.confirmedCount} confirmed sales`} />
            <SummaryCard label="Pending" value={`${result.summary.pendingCount} submitted`} raw={`${formatAtomic(result.summary.pendingInputLamports, 9)} SOL pending · excluded from confirmed totals`} />
          </div>
          <div className="mt-6 flex flex-wrap gap-2" aria-label="Transaction views">
            {VIEWS.map((item) => (
              <Button key={item.value} asChild size="sm" variant={view === item.value ? "primary" : "outline"}>
                <Link href={viewHref(query, item.value)}>{item.label}</Link>
              </Button>
            ))}
          </div>
          <form className="mt-4 grid gap-3 md:grid-cols-5">
            <select name="view" defaultValue={view} className="h-10 rounded-md border border-gt-border bg-gt-surface px-3 text-sm">
              {VIEWS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <Input name="query" defaultValue={query.query} maxLength={200} placeholder="Buyer, signature, quote, order" />
            <Input name="from" type="date" defaultValue={query.from} aria-label="From date" />
            <Input name="to" type="date" defaultValue={query.to} aria-label="To date" />
            <Button type="submit">Filter</Button>
          </form>
          <div className="mt-6 overflow-x-auto rounded-lg border border-gt-border">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-gt-surface text-xs uppercase tracking-wide text-gt-muted">
                <tr><th className="p-3">Buyer Wallet</th><th className="p-3">SOL Paid</th><th className="p-3">USD Value</th><th className="p-3">GTREE Received</th><th className="p-3">Status</th><th className="p-3">Date</th><th className="p-3">Transaction</th><th className="p-3">Details</th></tr>
              </thead>
              <tbody>
                {result.items.map((item) => (
                  <tr key={item.quoteId} className="border-t border-gt-border align-top">
                    <td className="p-3">
                      <div className="font-medium">Buyer</div>
                      <div className="mt-1 flex items-center gap-1 font-mono text-xs">
                        <a href={explorerAddressUrl(ENV.solscanBaseUrl, item.buyer)} target="_blank" rel="noreferrer" className="text-gt-emerald-bright hover:underline">{shorten(item.buyer)}</a>
                        <CopyButton value={item.buyer} label="Copy full buyer wallet" iconOnly />
                      </div>
                    </td>
                    <td className="p-3"><div className="font-mono">{formatAtomic(item.inputLamports, 9)} SOL</div><div className="mt-1 font-mono text-xs text-gt-muted">{item.inputLamports} lamports</div></td>
                    <td className="p-3"><div>{item.usdValue === null ? "Unavailable" : `$${item.usdValue}`}</div><div className="mt-1 text-xs text-gt-muted">{valuationLabel(item.valuationSource)}</div></td>
                    <td className="p-3"><div className="font-mono">{formatAtomic(item.outputTokenUnits, 9)} GTREE</div><div className="mt-1 font-mono text-xs text-gt-muted">{item.outputTokenUnits} raw units</div></td>
                    <td className="p-3"><Status state={item.state} /></td>
                    <td className="p-3 text-xs text-gt-muted">{formatTime(item.confirmedAt ?? item.submittedAt ?? item.failedAt ?? item.createdAt)}</td>
                    <td className="p-3">
                      {item.signature
                        ? <div className="flex items-center gap-1"><a href={explorerTxUrl(ENV.solscanBaseUrl, item.signature)} target="_blank" rel="noreferrer"
                            className="font-mono text-xs text-gt-emerald-bright hover:underline">{shorten(item.signature)}</a><CopyButton value={item.signature} label="Copy transaction signature" iconOnly /></div>
                        : <span className="text-gt-muted">—</span>}
                    </td>
                    <td className="p-3">
                      <details>
                        <summary className="cursor-pointer text-xs text-gt-emerald-bright">View details</summary>
                        <dl className="mt-2 grid max-w-72 gap-2 break-all font-mono text-xs text-gt-muted">
                          <div><dt className="text-gt-text">Quote ID</dt><dd>{item.quoteId}</dd></div>
                          <div><dt className="text-gt-text">Order ID</dt><dd>{item.orderId ?? "Not recorded"}</dd></div>
                          <div><dt className="text-gt-text">Full wallet</dt><dd>{item.buyer}</dd></div>
                          <div><dt className="text-gt-text">Full signature</dt><dd>{item.signature ?? "Not recorded"}</dd></div>
                          <div><dt className="text-gt-text">Created time</dt><dd>{formatTime(item.createdAt)}</dd></div>
                          <div><dt className="text-gt-text">Submitted time</dt><dd>{formatTime(item.submittedAt)}</dd></div>
                          <div><dt className="text-gt-text">Confirmed time</dt><dd>{formatTime(item.confirmedAt)}</dd></div>
                          <div><dt className="text-gt-text">Expiry</dt><dd>{formatTime(item.expiresAt)}</dd></div>
                          <div><dt className="text-gt-text">Failure reason</dt><dd>{item.failureReason ?? "Not recorded"}</dd></div>
                          <div><dt className="text-gt-text">Valuation source</dt><dd>{valuationLabel(item.valuationSource)}{item.solUsdPrice ? ` · SOL/USD ${item.solUsdPrice}` : ""}</dd></div>
                        </dl>
                      </details>
                    </td>
                  </tr>
                ))}
                {!result.items.length && <tr><td colSpan={8} className="p-10 text-center text-gt-muted">No transactions match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination query={query} page={result.page} total={result.total} pageSize={result.pageSize} />
        </>
      )}
    </section>
  );
}

function Pagination({ query, page, total, pageSize }: { query: Query; page: number; total: number; pageSize: number }) {
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  if (pages <= 1) return null;
  return (
    <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Pagination">
      <span className="text-gt-muted">Page {page} of {pages}</span>
      <div className="flex gap-2">
        {page > 1 && <Button asChild size="sm" variant="outline"><Link href={pageHref(query, page - 1)}>Previous</Link></Button>}
        {page < pages && <Button asChild size="sm" variant="outline"><Link href={pageHref(query, page + 1)}>Next</Link></Button>}
      </div>
    </nav>
  );
}

function parseDate(value: string | undefined, end: boolean) {
  if (!value) return undefined;
  const parsed = Date.parse(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isFinite(parsed) ? parsed : undefined;
}
function pageHref(query: Query, page: number) {
  const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
  params.set("page", String(page));
  return `/admin/transactions?${params}`;
}

function viewHref(query: Query, view: FoundationTransactionView) {
  const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
  params.set("view", view);
  params.delete("page");
  return `/admin/transactions?${params}`;
}

function formatTime(value: number | null) {
  return value === null ? "Not recorded" : new Date(value).toLocaleString();
}

function formatAtomic(value: string, decimals: number) {
  if (!/^\d+$/.test(value)) return "Unavailable";
  const padded = value.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function shorten(value: string) {
  return value.length <= 16 ? value : `${value.slice(0, 7)}…${value.slice(-7)}`;
}

function valuationLabel(source: "CONFIRMATION" | "QUOTE" | "CURRENT_ESTIMATE" | "UNAVAILABLE") {
  if (source === "CONFIRMATION") return "Historical confirmation";
  if (source === "QUOTE") return "Historical quote";
  if (source === "CURRENT_ESTIMATE") return "Estimated at current SOL/USD";
  return "Valuation unavailable";
}

function SummaryCard({ label, value, raw }: { label: string; value: string; raw?: string }) {
  return <div className="rounded-lg border border-gt-border p-4"><p className="text-xs text-gt-muted">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p>{raw && <p className="mt-1 text-xs text-gt-muted">{raw}</p>}</div>;
}

function Status({ state }: { state: string }) {
  const tone = state === "CONFIRMED" ? "text-gt-emerald-bright" : state === "FAILED" ? "text-red-300" : "text-gt-muted";
  return <span className={`font-mono text-xs ${tone}`}>{state}</span>;
}
