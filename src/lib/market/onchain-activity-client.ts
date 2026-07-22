import type { OnchainActivityRecord, OnchainActivityType } from "@/types/transaction";

export function createActivityRequestGuard() {
  let inFlight = false;
  return {
    get busy() {
      return inFlight;
    },
    async run<T>(task: () => Promise<T>): Promise<T | null> {
      if (inFlight) return null;
      inFlight = true;
      try {
        return await task();
      } finally {
        inFlight = false;
      }
    },
  };
}

export function isDisplayableActivityRecord(record: Pick<OnchainActivityRecord, "type" | "solAmount" | "gtreeAmount">): boolean {
  if (record.type === "UNKNOWN") return false;
  if (!record.solAmount && !record.gtreeAmount) return false;
  return true;
}

export function matchesActivityType(type: OnchainActivityType, filter: "all" | "direct-buys" | "transfers" | "treasury"): boolean {
  if (filter === "all") return true;
  if (filter === "direct-buys") return type === "FOUNDATION_DIRECT_BUY";
  if (filter === "transfers") return type === "GTREE_TRANSFER";
  if (filter === "treasury") return type === "TREASURY_ACTIVITY";
  return true;
}
