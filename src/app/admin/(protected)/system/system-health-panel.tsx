"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { HealthCheck } from "@/lib/admin/system-health";
import { createRefreshGuard, statusClass, type RefreshGuard } from "./system-health-model";

export function SystemHealthPanel({
  checkedAt,
  checks,
  summary,
}: {
  checkedAt: number;
  checks: HealthCheck[];
  summary: string;
}) {
  const router = useRouter();
  const guard = useRef<RefreshGuard>(createRefreshGuard());
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isPending) guard.current.finish();
  }, [isPending]);

  function refresh() {
    if (!guard.current.tryStart()) return;
    startTransition(() => router.refresh());
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-gt-emerald-bright">Bounded diagnostics</p>
          <h1 className="mt-2 text-3xl font-semibold">System health</h1>
          <p className="mt-2 text-sm text-gt-muted">
            Read-only checks. Endpoint URLs and signer material are never returned.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center rounded-md border border-gt-border px-4 text-sm font-medium transition-colors hover:bg-gt-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Refreshing…" : "Refresh checks"}
        </button>
      </div>
      <p className="mt-5 text-xs text-gt-muted">
        {summary} · Checked {new Date(checkedAt).toLocaleString()}. No automatic polling.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {checks.map((item) => (
          <article key={item.key} className="rounded-lg border border-gt-border bg-gt-charcoal/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">{item.label}</h2>
              <span className={`rounded border px-2 py-1 text-xs ${statusClass(item.status)}`}>{item.status}</span>
            </div>
            <p className="mt-3 text-sm text-gt-muted">{item.detail}</p>
            <p className="mt-2 text-xs text-gt-muted">
              {item.latencyMs === null ? "Latency unknown" : `${item.latencyMs} ms`}
              {" · "}Last checked {new Date(item.checkedAt).toLocaleTimeString()}
              {item.retryable && item.status !== "HEALTHY" ? " · Retryable" : ""}
            </p>
          </article>
        ))}
      </div>
    </>
  );
}
