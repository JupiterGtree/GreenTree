/* eslint-disable @typescript-eslint/no-explicit-any */
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
const NOW = 1_900_000_000_000;
const OWNER = {
  id: "00000000-0000-4000-8000-000000000101",
  email: "owner@content.test",
  displayName: "Content Owner",
  role: "OWNER" as const,
};
const ADMIN = {
  id: "00000000-0000-4000-8000-000000000102",
  email: "admin@content.test",
  displayName: null,
  role: "ADMIN" as const,
};
const EDITOR = {
  id: "00000000-0000-4000-8000-000000000103",
  email: "editor@content.test",
  displayName: null,
  role: "EDITOR" as const,
};

async function loadModules() {
  const [{ AdminDatabase }, { AdminPermissionError }, content] = await Promise.all([
    import("../src/lib/admin/database"),
    import("../src/lib/admin/permissions"),
    import("../src/lib/admin/site-content"),
  ]);
  return { AdminDatabase, AdminPermissionError, ...content };
}

function fixture(
  AdminDatabase: typeof import("../src/lib/admin/database").AdminDatabase,
  SiteContentService: typeof import("../src/lib/admin/site-content").SiteContentService,
  environment: NodeJS.ProcessEnv = { NODE_ENV: "test" },
) {
  const directory = mkdtempSync(join(tmpdir(), "gtt-site-content-"));
  const database = new AdminDatabase({ path: join(directory, "admin.sqlite"), now: () => NOW });
  for (const actor of [OWNER, ADMIN, EDITOR]) {
    database.db.prepare(`
      INSERT INTO admin_users (
        id, email, password_hash, role, display_name, is_active, created_at, updated_at
      ) VALUES (?, ?, 'scrypt$v=1$fixture', ?, ?, 1, ?, ?)
    `).run(actor.id, actor.email, actor.role, actor.displayName, NOW, NOW);
  }
  return {
    database,
    service: new SiteContentService(database, () => NOW, environment),
    cleanup() {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("site content defaults are deterministic and preserve the official X URL", async (t) => {
  const { AdminDatabase, SiteContentService, DEFAULT_SITE_CONTENT } = await loadModules();
  const context = fixture(AdminDatabase, SiteContentService);
  t.after(() => context.cleanup());
  const value = context.service.get();
  assert.equal(value.source, "DEFAULT");
  assert.equal(value.hero.title, DEFAULT_SITE_CONTENT.hero.title);
  assert.equal(value.fixedXUrl, "https://x.com/GreenTreedHQ");
});

test("OWNER and ADMIN can publish validated content and every update is audited", async (t) => {
  const { AdminDatabase, SiteContentService, DEFAULT_SITE_CONTENT } = await loadModules();
  const context = fixture(AdminDatabase, SiteContentService);
  t.after(() => context.cleanup());
  const settings = structuredClone(DEFAULT_SITE_CONTENT);
  settings.banner = { enabled: true, tone: "MAINTENANCE", message: "Scheduled maintenance at 21:00 UTC." };
  settings.hero.title = "A verified market with a greener mission.";
  settings.home.partnershipsVisible = false;
  settings.footer.telegramUrl = "https://t.me/GreenTreeCommunity";
  settings.marketWarning = `${settings.marketWarning} Only participate after reviewing current conditions.`;

  const updated = context.service.update(settings, "Publish scheduled maintenance messaging", ADMIN);
  assert.equal(updated.source, "DB");
  assert.equal(updated.banner.message, settings.banner.message);
  assert.equal(updated.home.partnershipsVisible, false);

  const history = context.database.db.prepare(
    "SELECT setting_key FROM admin_setting_history WHERE setting_key = 'site.content'",
  ).all();
  assert.equal(history.length, 1);
  const audit = context.database.db.prepare(`
    SELECT actor_role, metadata_json FROM admin_audit_logs
    WHERE action = 'SITE_CONTENT_CHANGED'
  `).get() as { actor_role: string; metadata_json: string };
  assert.equal(audit.actor_role, "ADMIN");
  assert.deepEqual(
    JSON.parse(audit.metadata_json).changedFields.sort(),
    ["banner", "footer", "hero", "home", "marketWarning"].sort(),
  );
});

test("site content rejects unauthorized, unsafe, and decorative-only values", async (t) => {
  const {
    AdminDatabase,
    AdminPermissionError,
    SiteContentError,
    SiteContentService,
    DEFAULT_SITE_CONTENT,
  } = await loadModules();
  const context = fixture(AdminDatabase, SiteContentService);
  t.after(() => context.cleanup());
  assert.throws(
    () => context.service.update(DEFAULT_SITE_CONTENT, "Editor attempted a content update", EDITOR),
    AdminPermissionError,
  );
  const unsafe = structuredClone(DEFAULT_SITE_CONTENT);
  unsafe.footer.telegramUrl = "javascript:alert(1)";
  assert.throws(
    () => context.service.update(unsafe, "Reject unsafe social destination", OWNER),
    SiteContentError,
  );
  const unknownFeatured = structuredClone(DEFAULT_SITE_CONTENT);
  unknownFeatured.featuredNewsIds = ["missing-post"];
  assert.throws(
    () => context.service.update(unknownFeatured, "Reject a non-public featured post", OWNER),
    (error: unknown) => error instanceof SiteContentError && error.code === "FEATURED_NEWS",
  );
  assert.equal("fixedXUrl" in DEFAULT_SITE_CONTENT, false);
});

test("environmental missions fail disabled and reject invalid environment values", async (t) => {
  const { AdminDatabase, SiteContentService } = await loadModules();
  const defaultContext = fixture(AdminDatabase, SiteContentService);
  const invalidContext = fixture(AdminDatabase, SiteContentService, {
    NODE_ENV: "test",
    ENVIRONMENTAL_MISSIONS_ENABLED: "TRUE",
  });
  t.after(() => {
    defaultContext.cleanup();
    invalidContext.cleanup();
  });
  assert.equal(defaultContext.service.get().environmentalMissionsEnabled, false);
  assert.equal(invalidContext.service.get().environmentalMissionsEnabled, false);
  assert.equal(invalidContext.service.get().environmentalMissionsEnvironmentOverride, true);
});

test("ADMIN enabling missions requires explicit confirmation and writes only settings audit data", async (t) => {
  const { AdminDatabase, SiteContentError, SiteContentService, DEFAULT_SITE_CONTENT } = await loadModules();
  const context = fixture(AdminDatabase, SiteContentService);
  t.after(() => context.cleanup());
  const settings = structuredClone(DEFAULT_SITE_CONTENT);
  settings.environmentalMissionsEnabled = true;

  assert.throws(
    () => context.service.update(settings, "Enable reviewed environmental mission interactions", ADMIN),
    SiteContentError,
  );
  const updated = context.service.update(
    settings,
    "Enable reviewed environmental mission interactions",
    ADMIN,
    "ENABLE ENVIRONMENTAL MISSIONS",
  );
  assert.equal(updated.environmentalMissionsEnabled, true);

  const audit = context.database.db.prepare(`
    SELECT actor_role, metadata_json FROM admin_audit_logs
    WHERE action = 'SITE_CONTENT_CHANGED'
  `).get() as { actor_role: string; metadata_json: string };
  assert.equal(audit.actor_role, "ADMIN");
  assert.deepEqual(JSON.parse(audit.metadata_json).changedFields, ["environmentalMissionsEnabled"]);
  const missionTables = context.database.db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND lower(name) LIKE '%mission%'
  `).all();
  assert.deepEqual(missionTables, []);
});
