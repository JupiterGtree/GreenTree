import { Module } from "node:module";

type RequireFunction = (id: string, ...args: unknown[]) => unknown;
const moduleWithRequire = Module.prototype as typeof Module.prototype & { require: RequireFunction };
const originalRequire = moduleWithRequire.require;
moduleWithRequire.require = function (id: string, ...args: unknown[]) {
  if (id === "server-only") return {};
  return originalRequire.apply(this, [id, ...args]);
};

void import("@/lib/telegram/notification-worker").then(({ startNotificationWorker }) => startNotificationWorker()).catch((error) => {
  console.error("telegram_notification_worker_fatal", { message: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
