/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { Module } from "node:module";

const originalRequire = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string, ...args: any[]) {
  if (id === "server-only") return {};
  return originalRequire.apply(this, [id, ...args] as any);
};

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PartnershipInput } from "../src/lib/partnerships/service";

const { AdminDatabase } = require("../src/lib/admin/database") as typeof import("../src/lib/admin/database");
const {
  PartnershipRateLimitError, PartnershipService, PartnershipValidationError,
  csvCell, normalizeTelegram, normalizeX,
} = require("../src/lib/partnerships/service") as typeof import("../src/lib/partnerships/service");

const SECRET = "partnership-test-hmac-secret-at-least-32-characters";
const ACTOR = { id: "00000000-0000-4000-8000-000000000001", email: "owner@example.test" };

function fixture(options: { maxPerIp?: number } = {}) {
  let now = Date.UTC(2026, 6, 21, 12);
  const directory = mkdtempSync(join(tmpdir(), "gtt-partnerships-"));
  const database = new AdminDatabase({ path: join(directory, "admin.sqlite"), now: () => now });
  database.db.prepare(`
    INSERT INTO admin_users (id, email, password_hash, role, created_at, updated_at)
    VALUES (?, ?, 'unused', 'OWNER', ?, ?)
  `).run(ACTOR.id, ACTOR.email, now, now);
  const service = new PartnershipService(database, {
    secret: SECRET, now: () => now, minCompletionMs: 0,
    maxPerIp: options.maxPerIp ?? 10,
  });
  return {
    database, service,
    advance(ms: number) { now += ms; },
    cleanup() { database.close(); rmSync(directory, { recursive: true, force: true }); },
  };
}

function valid(overrides: Partial<PartnershipInput> = {}): PartnershipInput {
  return {
    nameOrProject: "Canopy Labs",
    category: "TECHNOLOGY",
    contactType: "X",
    contact: "@canopy_labs",
    proposal: "We propose integrating verified restoration records into Green Tree reporting.",
    startedAt: 0,
    ...overrides,
  };
}

test("valid X, Telegram and email requests succeed and normalize contacts", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  const x = context.service.submit(valid(), "192.0.2.1");
  context.advance(1);
  const telegram = context.service.submit(valid({
    contactType: "TELEGRAM", contact: "https://t.me/Canopy_Team",
    nameOrProject: "Canopy Telegram", proposal: "A Telegram-led environmental education campaign.",
  }), "192.0.2.2");
  context.advance(1);
  const email = context.service.submit(valid({
    contactType: "EMAIL", contact: "HELLO@CANOPY.EXAMPLE", nameOrProject: "Canopy Email",
    proposal: "A research partnership for transparent environmental measurement.",
  }), "192.0.2.3");
  assert.equal(x.success && telegram.success && email.success, true);
  const records = context.service.repository.list({ sort: "oldest" }).items;
  assert.deepEqual(records.map((record) => record.normalizedContact), [
    "@canopy_labs", "@canopy_team", "hello@canopy.example",
  ]);
});

test("missing or invalid selected contact fails", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  assert.throws(() => context.service.submit(valid({ contact: "" }), "192.0.2.4"), PartnershipValidationError);
  assert.throws(() => context.service.submit(valid({ contactType: "EMAIL", contact: "not-email" }), "192.0.2.4"), PartnershipValidationError);
});

test("X and Telegram URLs normalize exactly like handles", () => {
  assert.equal(normalizeX("@GreenTreedHQ").handle, normalizeX("https://x.com/GreenTreedHQ").handle);
  assert.equal(normalizeTelegram("@Gttofficial").handle, normalizeTelegram("https://t.me/Gttofficial").handle);
});

test("accepted requests receive UUIDs and unpredictable public numbers", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  const result = context.service.submit(valid(), "192.0.2.5");
  const row = context.database.db.prepare(
    "SELECT id, request_number FROM partnership_requests",
  ).get() as { id: string; request_number: string };
  assert.match(row.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.match(row.request_number, /^GTP-20260721-[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(result.requestNumber, row.request_number);
});

test("duplicate requests return one existing request number", async (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  const [first, second] = await Promise.all([
    Promise.resolve().then(() => context.service.submit(valid(), "192.0.2.6")),
    Promise.resolve().then(() => context.service.submit(valid(), "192.0.2.6")),
  ]);
  assert.equal(first.requestNumber, second.requestNumber);
  assert.equal([first.duplicate, second.duplicate].filter(Boolean).length, 1);
  const count = context.database.db.prepare("SELECT count(*) AS total FROM partnership_requests").get() as { total: number };
  assert.equal(count.total, 1);
});

test("materially different proposal is accepted", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  const first = context.service.submit(valid(), "192.0.2.7");
  const second = context.service.submit(valid({
    proposal: "A materially different proposal to co-host an independent restoration research program.",
  }), "192.0.2.7");
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, false);
  assert.notEqual(first.requestNumber, second.requestNumber);
});

test("honeypot, minimum completion and hashed-IP rate limits reject spam", (t) => {
  const context = fixture({ maxPerIp: 1 });
  t.after(() => context.cleanup());
  assert.throws(() => context.service.submit(valid({ company: "spam" }), "192.0.2.8"), PartnershipValidationError);
  const strict = new PartnershipService(context.database, {
    secret: SECRET, now: () => Date.UTC(2026, 6, 21, 12), minCompletionMs: 2_000,
  });
  assert.throws(() => strict.submit(valid({ startedAt: Date.UTC(2026, 6, 21, 12) }), "192.0.2.8"), PartnershipValidationError);
  context.service.submit(valid(), "192.0.2.8");
  assert.throws(() => context.service.submit(valid({
    nameOrProject: "Other Project",
    proposal: "This is another materially distinct proposal that should reach the IP limiter.",
  }), "192.0.2.8"), PartnershipRateLimitError);
});

test("public submission result never exposes internal data", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  const result = context.service.submit(valid(), "192.0.2.9");
  assert.deepEqual(Object.keys(result).sort(), ["duplicate", "requestNumber", "submittedAt", "success"]);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("fingerprint"));
  assert.ok(!serialized.includes("internal"));
  assert.ok(!serialized.includes("00000000-"));
});

test("status updates create timeline and admin audit records", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  context.service.submit(valid(), "192.0.2.10");
  const row = context.database.db.prepare("SELECT id FROM partnership_requests").get() as { id: string };
  context.service.updateStatus(row.id, "REVIEWING", ACTOR);
  const event = context.database.db.prepare(
    "SELECT event_type, from_status, to_status FROM partnership_request_events WHERE request_id = ? ORDER BY id DESC",
  ).get(row.id) as { event_type: string; from_status: string; to_status: string };
  const audit = context.database.db.prepare(
    "SELECT action, actor_user_id FROM admin_audit_logs WHERE target_id = ? AND action = 'PARTNERSHIP_STATUS_CHANGED'",
  ).get(row.id) as { action: string; actor_user_id: string };
  assert.equal(event.event_type, "STATUS_CHANGED");
  assert.equal(event.from_status, "NEW");
  assert.equal(event.to_status, "REVIEWING");
  assert.equal(audit.action, "PARTNERSHIP_STATUS_CHANGED");
  assert.equal(audit.actor_user_id, ACTOR.id);
});

test("public submissions create timeline and privacy-safe audit records", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  context.service.submit(valid(), "192.0.2.15");
  const audit = context.database.db.prepare(`
    SELECT action, actor_user_id, ip_hash, metadata_json
    FROM admin_audit_logs WHERE action = 'PARTNERSHIP_SUBMITTED'
  `).get() as { action: string; actor_user_id: string | null; ip_hash: string; metadata_json: string };
  assert.equal(audit.action, "PARTNERSHIP_SUBMITTED");
  assert.equal(audit.actor_user_id, null);
  assert.match(audit.ip_hash, /^[a-f0-9]{64}$/);
  assert.ok(!audit.metadata_json.includes("192.0.2.15"));
});

test("admin search includes proposal and website fields", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  context.service.submit(valid({
    website: "canopy-search.example",
    proposal: "A uniquely searchable biodiversity restoration proposal.",
  }), "192.0.2.16");
  assert.equal(context.service.repository.list({ query: "biodiversity restoration" }).total, 1);
  assert.equal(context.service.repository.list({ query: "canopy-search.example" }).total, 1);
});

test("optional website is accepted and proposal length is bounded", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  context.service.submit(valid({ website: "canopy.example" }), "192.0.2.11");
  assert.equal(context.service.repository.list().items[0]?.website, "https://canopy.example");
  assert.throws(
    () => context.service.submit(valid({ proposal: "a".repeat(801) }), "192.0.2.12"),
    PartnershipValidationError,
  );
});

test("old-format records with multiple contacts remain readable", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  context.service.submit(valid(), "192.0.2.13");
  const id = (context.database.db.prepare("SELECT id FROM partnership_requests").get() as { id: string }).id;
  context.database.db.prepare(`
    UPDATE partnership_requests
    SET preferred_contact_type = NULL, telegram_handle = 'legacy_team',
        telegram_display = '@legacy_team', email = 'legacy@example.test',
        introduction = 'Legacy introduction', supporting_link = 'https://legacy.example'
    WHERE id = ?
  `).run(id);
  const record = context.service.repository.findById(id);
  assert.equal(record?.preferredContactType, "MULTIPLE");
  assert.equal(record?.normalizedContact, "@canopy_labs · @legacy_team · legacy@example.test");
  assert.equal(record?.introduction, "Legacy introduction");
  assert.equal(record?.supportingLink, "https://legacy.example");
});

test("CSV export escapes spreadsheet formulas and audits export", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  context.service.submit(valid({ nameOrProject: "=cmd|' /C calc'!A0" }), "192.0.2.14");
  const csv = context.service.exportCsv(context.service.repository.list().items, ACTOR);
  assert.ok(csv.includes(csvCell("=cmd|' /C calc'!A0")));
  assert.ok(csv.includes("\"'=cmd"));
  const audit = context.database.db.prepare(
    "SELECT action FROM admin_audit_logs WHERE action = 'PARTNERSHIP_CSV_EXPORTED'",
  ).get() as { action: string };
  assert.equal(audit.action, "PARTNERSHIP_CSV_EXPORTED");
});
