import "server-only";

import { resolveRuntimeSetting } from "@/lib/admin/runtime-settings";

export function getFoundationDirectQuotePolicy() {
  return {
    purchaseMode: resolveRuntimeSetting("purchaseMode"),
    emergencyPaused: resolveRuntimeSetting("emergencyPaused"),
    minPurchaseLamports: resolveRuntimeSetting("minPurchaseLamports"),
    maxPurchaseLamports: resolveRuntimeSetting("maxPurchaseLamports"),
    automaticQuoteRefreshIntervalMs: resolveRuntimeSetting("automaticQuoteRefreshIntervalMs"),
  };
}
