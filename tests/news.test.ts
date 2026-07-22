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
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { NewsService as NewsServiceType } from "../src/lib/news/service";

const { SafeMarkdown, safeMarkdownUrl } =
  require("../src/components/news/safe-markdown") as typeof import("../src/components/news/safe-markdown");
const { AdminDatabase } =
  require("../src/lib/admin/database") as typeof import("../src/lib/admin/database");
const { NewsService, NewsValidationError } =
  require("../src/lib/news/service") as typeof import("../src/lib/news/service");

const ACTOR = { id: "00000000-0000-4000-8000-000000000001", email: "editor@example.test" };

function fixture() {
  let now = 1_800_000_000_000;
  const directory = mkdtempSync(join(tmpdir(), "gtt-news-"));
  const database = new AdminDatabase({ path: join(directory, "news.sqlite"), now: () => now });
  database.db.prepare(`
    INSERT INTO admin_users (id, email, password_hash, role, created_at, updated_at)
    VALUES (?, ?, 'unused-in-news-tests', 'EDITOR', ?, ?)
  `).run(ACTOR.id, ACTOR.email, now, now);
  const service = new NewsService(database, () => now);
  return {
    database,
    service,
    setNow(value: number) { now = value; },
    cleanup() {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function draft(service: NewsServiceType, title: string) {
  return service.create({
    title,
    excerpt: `${title} excerpt`,
    body: `# ${title}\n\nSafe body.`,
    category: "Project",
    tags: ["Update", "Green Tree"],
  }, ACTOR);
}

test("public visibility includes due schedules and excludes non-public states", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  const published = draft(context.service, "Published update");
  const scheduled = draft(context.service, "Scheduled update");
  const hidden = draft(context.service, "Hidden draft");
  context.service.publish(published.id, ACTOR);
  context.service.schedule(scheduled.id, 1_800_000_010_000, ACTOR);
  assert.deepEqual(context.service.repository.listVisible().map((post) => post.id), [published.id]);
  context.setNow(1_800_000_010_001);
  const ids = context.service.repository.listVisible().map((post) => post.id);
  assert.ok(ids.includes(published.id));
  assert.ok(ids.includes(scheduled.id));
  assert.ok(!ids.includes(hidden.id));
  context.service.archive(published.id, ACTOR);
  assert.equal(context.service.repository.findVisibleBySlug(published.slug), null);
});

test("slugs are normalized and made unique", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  const first = draft(context.service, "Hello, Green Tree!");
  const second = draft(context.service, "Hello Green Tree");
  assert.equal(first.slug, "hello-green-tree");
  assert.equal(second.slug, "hello-green-tree-2");
});

test("news input validation rejects unsafe or incomplete content", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  assert.throws(
    () => context.service.create({ title: "No", body: "", coverImage: "javascript:alert(1)" }, ACTOR),
    NewsValidationError,
  );
});

test("latest returns at most three visible posts in descending date order", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  const published: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    context.setNow(1_800_000_000_000 + index * 1_000);
    const post = draft(context.service, `Update number ${index}`);
    context.service.publish(post.id, ACTOR);
    published.push(post.id);
  }
  assert.deepEqual(context.service.repository.latest(3).map((post) => post.id), published.reverse().slice(0, 3));
});

test("every news write records an actor audit entry", (t) => {
  const context = fixture();
  t.after(() => context.cleanup());
  const post = draft(context.service, "Audited update");
  context.service.edit(post.id, { title: "Audited update edited", body: "New body." }, ACTOR);
  context.service.publish(post.id, ACTOR);
  const rows = context.database.db.prepare(`
    SELECT action, actor_user_id, target_id FROM admin_audit_logs
    WHERE target_type = 'news_post' AND target_id = ? ORDER BY id
  `).all(post.id) as Array<{ action: string; actor_user_id: string; target_id: string }>;
  assert.deepEqual(rows.map((row) => row.action), ["NEWS_CREATED", "NEWS_EDITED", "NEWS_PUBLISHED"]);
  assert.ok(rows.every((row) => row.actor_user_id === ACTOR.id));
  assert.deepEqual(
    context.service.repository.history(post.id).map((entry) => entry.action),
    ["PUBLISHED", "EDITED", "CREATED"],
  );
});

test("Markdown rendering escapes HTML and blocks executable URLs", () => {
  const html = renderToStaticMarkup(createElement(SafeMarkdown, {
    source: `<script>alert("x")</script>\n\n[bad](javascript:alert(1))\n\n![bad](data:image/svg+xml,x)`,
  }));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(!html.includes("data:image"));
  assert.equal(safeMarkdownUrl("javascript:alert(1)"), null);
  assert.equal(safeMarkdownUrl("https://example.test/image.jpg", true), "https://example.test/image.jpg");
});
