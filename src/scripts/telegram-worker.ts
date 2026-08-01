import "server-only";
import { startNotificationWorker } from "@/lib/telegram/notification-worker";

void startNotificationWorker().catch((error) => {
  console.error("telegram_notification_worker_fatal", { message: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
