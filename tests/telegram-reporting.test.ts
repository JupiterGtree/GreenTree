import "./server-only-shim.cjs";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.TELEGRAM_BOT_DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "gtree-reporting-")), "telegram.sqlite3");
process.env.TELEGRAM_ANALYTICS_REPORT_INTERVAL_MS = "3600000";
process.env.TELEGRAM_ANALYTICS_REPORT_ENABLED = "true";

import { enqueueAnalyticsSummary, buildAnalyticsSummary, discoverFoundationReportingEvents } from "../src/lib/telegram/reporting";
import { getTelegramDatabase } from "../src/lib/telegram/bot-database";

test("first reporting run establishes a checkpoint without replaying history", () => {
  assert.equal(discoverFoundationReportingEvents(Date.now()), 0);
  const checkpoint = getTelegramDatabase().prepare("SELECT cursor FROM telegram_event_checkpoints WHERE name = 'foundation-reporting'").get() as { cursor: string };
  assert.equal(Number.isFinite(Number(checkpoint.cursor)), true);
});

test("analytics summary is available and interval enqueue is idempotent", () => {
  const summary = buildAnalyticsSummary(Date.now());
  assert.equal(typeof summary.metrics, "object");
  assert.equal(enqueueAnalyticsSummary(10_000), true);
  assert.equal(enqueueAnalyticsSummary(10_000), false);
});
