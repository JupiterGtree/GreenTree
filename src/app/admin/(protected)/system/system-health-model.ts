import type { HealthCheck, HealthStatus } from "@/lib/admin/system-health";

export interface SystemHealthPageModel {
  checkedAt: number;
  checks: HealthCheck[];
  summary: "All healthy" | "Some services degraded" | "Some services unavailable" | "Health status unknown";
}

export function buildSystemHealthPageModel(
  checkedAt: number,
  checks: HealthCheck[],
): SystemHealthPageModel {
  return { checkedAt, checks, summary: summarizeHealth(checks) };
}

export function summarizeHealth(checks: HealthCheck[]): SystemHealthPageModel["summary"] {
  if (checks.length === 0) return "Health status unknown";
  if (checks.some((check) => check.status === "UNAVAILABLE")) return "Some services unavailable";
  if (checks.some((check) => check.status === "DEGRADED")) return "Some services degraded";
  if (checks.some((check) => check.status === "UNKNOWN")) return "Health status unknown";
  return "All healthy";
}

export interface RefreshGuard {
  tryStart(): boolean;
  finish(): void;
  isRunning(): boolean;
}

export function createRefreshGuard(): RefreshGuard {
  let running = false;
  return {
    tryStart() {
      if (running) return false;
      running = true;
      return true;
    },
    finish() {
      running = false;
    },
    isRunning() {
      return running;
    },
  };
}

export function statusClass(status: HealthStatus): string {
  if (status === "HEALTHY") return "border-emerald-500/40 text-emerald-300";
  if (status === "DEGRADED") return "border-amber-500/40 text-amber-300";
  if (status === "UNAVAILABLE") return "border-red-500/40 text-red-300";
  return "border-gt-border text-gt-muted";
}
