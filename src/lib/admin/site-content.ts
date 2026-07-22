import "server-only";

import { appendAdminAuditLog } from "./audit";
import type { AdminIdentity } from "./auth";
import { getAdminDatabase, type AdminDatabase } from "./database";
import { AdminPermissionError } from "./permissions";

const SETTING_KEY = "site.content";
const FIXED_X_URL = "https://x.com/GreenTreedHQ";

export type BannerTone = "NOTICE" | "MAINTENANCE";

export interface SiteContentSettings {
  environmentalMissionsEnabled: boolean;
  banner: { enabled: boolean; tone: BannerTone; message: string };
  hero: { title: string; subtitle: string };
  home: {
    transparencyVisible: boolean;
    latestNewsVisible: boolean;
    partnershipsVisible: boolean;
  };
  featuredNewsIds: string[];
  footer: { description: string; telegramUrl: string; supportEmail: string };
  marketWarning: string;
}

export const DEFAULT_SITE_CONTENT: SiteContentSettings = {
  environmentalMissionsEnabled: false,
  banner: { enabled: false, tone: "NOTICE", message: "" },
  hero: {
    title: "A public market. A greener mission.",
    subtitle:
      "GTREE connects live Solana market access with transparent records, community participation, and environmental action that can be verified.",
  },
  home: {
    transparencyVisible: true,
    latestNewsVisible: true,
    partnershipsVisible: true,
  },
  featuredNewsIds: [],
  footer: {
    description:
      "An open Solana market with transparent records and a framework for evidence-based environmental action.",
    telegramUrl: "https://t.me/Gttofficial",
    supportEmail: "support@gtree.land",
  },
  marketWarning:
    "GTREE participation involves market, liquidity and execution risk. Price can rise or fall, quotes expire, and slippage may be material. Green Tree does not guarantee price appreciation, a price floor, a buyback, or permanent liquidity.",
};

export interface SiteContentView extends SiteContentSettings {
  fixedXUrl: typeof FIXED_X_URL;
  source: "DB" | "DEFAULT";
  updatedAt: number | null;
  environmentalMissionsEnvironmentOverride: boolean;
  environmentalMissionsStoredEnabled: boolean;
}

export class SiteContentError extends Error {
  constructor(message: string, readonly code: "INVALID" | "FEATURED_NEWS") {
    super(message);
    this.name = "SiteContentError";
  }
}

export class SiteContentService {
  constructor(
    private readonly database: AdminDatabase = getAdminDatabase(),
    private readonly now: () => number = Date.now,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {}

  get(): SiteContentView {
    const row = this.database.db.prepare(
      "SELECT value_json, updated_at FROM admin_runtime_settings WHERE key = ?",
    ).get(SETTING_KEY) as { value_json: string; updated_at: number } | undefined;
    if (!row) return this.toView(structuredClone(DEFAULT_SITE_CONTENT), "DEFAULT", null);
    try {
      return this.toView(validateSettings(JSON.parse(row.value_json)), "DB", row.updated_at);
    } catch {
      return this.toView(structuredClone(DEFAULT_SITE_CONTENT), "DEFAULT", null);
    }
  }

  update(input: unknown, reason: string, actor: AdminIdentity, confirmation?: string): SiteContentView {
    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      throw new AdminPermissionError("admin.settings.manage");
    }
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 10 || normalizedReason.length > 500) {
      throw new SiteContentError("A reason from 10 to 500 characters is required.", "INVALID");
    }
    const settings = validateSettings(input);
    this.validateFeaturedNews(settings.featuredNewsIds);
    const old = this.get();
    if (old.environmentalMissionsEnvironmentOverride) {
      settings.environmentalMissionsEnabled = old.environmentalMissionsStoredEnabled;
    }
    if (!old.environmentalMissionsStoredEnabled && settings.environmentalMissionsEnabled) {
      const expected = "ENABLE ENVIRONMENTAL MISSIONS";
      if (confirmation !== expected) {
        throw new SiteContentError(`Type "${expected}" to confirm enabling environmental missions.`, "INVALID");
      }
    }
    const now = this.now();
    this.database.transaction(() => {
      this.database.db.prepare(`
        INSERT INTO admin_runtime_settings (
          key, value_json, description, updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
          description = excluded.description, updated_by_user_id = excluded.updated_by_user_id,
          updated_at = excluded.updated_at
      `).run(
        SETTING_KEY,
        JSON.stringify(settings),
        "Public site content and visibility settings.",
        actor.id,
        now,
        now,
      );
      this.database.db.prepare(`
        INSERT INTO admin_setting_history (
          setting_key, previous_value_json, new_value_json, changed_by_user_id, changed_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(SETTING_KEY, JSON.stringify(stripView(old)), JSON.stringify(settings), actor.id, now);
      appendAdminAuditLog(this.database, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "SITE_CONTENT_CHANGED",
        targetType: "site_content",
        targetId: SETTING_KEY,
        metadata: {
          reason: normalizedReason,
          changedFields: changedPaths(stripView(old), settings),
        },
        createdAt: now,
      });
    });
    return this.get();
  }

  private toView(
    settings: SiteContentSettings,
    source: "DB" | "DEFAULT",
    updatedAt: number | null,
  ): SiteContentView {
    const rawOverride = this.environment.ENVIRONMENTAL_MISSIONS_ENABLED?.trim();
    const environmentOverride = rawOverride !== undefined && rawOverride !== "";
    return {
      ...settings,
      environmentalMissionsEnabled: rawOverride === "true"
        ? true
        : rawOverride === "false"
          ? false
          : environmentOverride
            ? false
            : settings.environmentalMissionsEnabled,
      fixedXUrl: FIXED_X_URL,
      source,
      updatedAt,
      environmentalMissionsEnvironmentOverride: environmentOverride,
      environmentalMissionsStoredEnabled: settings.environmentalMissionsEnabled,
    };
  }

  private validateFeaturedNews(ids: string[]): void {
    if (!ids.length) return;
    const placeholders = ids.map(() => "?").join(",");
    const rows = this.database.db.prepare(`
      SELECT id FROM news_posts
      WHERE id IN (${placeholders}) AND (
        (status = 'PUBLISHED' AND published_at IS NOT NULL AND published_at <= ?)
        OR (status = 'SCHEDULED' AND scheduled_at IS NOT NULL AND scheduled_at <= ?)
      )
    `).all(...ids, this.now(), this.now()) as Array<{ id: string }>;
    if (rows.length !== ids.length) {
      throw new SiteContentError("Featured news must contain only currently public posts.", "FEATURED_NEWS");
    }
  }
}

export function getSiteContent(): SiteContentView {
  try {
    return new SiteContentService().get();
  } catch {
    return {
      ...structuredClone(DEFAULT_SITE_CONTENT),
      fixedXUrl: FIXED_X_URL,
      source: "DEFAULT",
      updatedAt: null,
      environmentalMissionsEnvironmentOverride: false,
      environmentalMissionsStoredEnabled: false,
    };
  }
}

function validateSettings(input: unknown): SiteContentSettings {
  const root = object(input, "Site content");
  const banner = object(root.banner, "Banner");
  const hero = object(root.hero, "Hero");
  const home = object(root.home, "Home visibility");
  const footer = object(root.footer, "Footer");
  const tone = banner.tone;
  if (tone !== "NOTICE" && tone !== "MAINTENANCE") {
    throw new SiteContentError("Banner tone is invalid.", "INVALID");
  }
  if (!Array.isArray(root.featuredNewsIds) || root.featuredNewsIds.length > 3) {
    throw new SiteContentError("Choose no more than three featured news posts.", "INVALID");
  }
  const featuredNewsIds = root.featuredNewsIds.map((value) =>
    text(value, "Featured news ID", 1, 100),
  );
  if (new Set(featuredNewsIds).size !== featuredNewsIds.length) {
    throw new SiteContentError("Featured news selections must be unique.", "INVALID");
  }
  const telegramUrl = text(footer.telegramUrl, "Telegram URL", 8, 300);
  let parsedTelegram: URL;
  try {
    parsedTelegram = new URL(telegramUrl);
  } catch {
    throw new SiteContentError("Telegram URL must be a valid HTTPS URL.", "INVALID");
  }
  if (parsedTelegram.protocol !== "https:" || parsedTelegram.hostname !== "t.me") {
    throw new SiteContentError("Telegram URL must use https://t.me.", "INVALID");
  }
  const supportEmail = text(footer.supportEmail, "Support email", 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
    throw new SiteContentError("Support email is invalid.", "INVALID");
  }
  return {
    environmentalMissionsEnabled: root.environmentalMissionsEnabled === undefined
      ? false
      : boolean(root.environmentalMissionsEnabled, "Environmental missions enabled"),
    banner: {
      enabled: boolean(banner.enabled, "Banner enabled"),
      tone,
      message: text(banner.message, "Banner message", banner.enabled ? 3 : 0, 300),
    },
    hero: {
      title: text(hero.title, "Hero title", 10, 100),
      subtitle: text(hero.subtitle, "Hero subtitle", 20, 300),
    },
    home: {
      transparencyVisible: boolean(home.transparencyVisible, "Transparency visibility"),
      latestNewsVisible: boolean(home.latestNewsVisible, "Latest news visibility"),
      partnershipsVisible: boolean(home.partnershipsVisible, "Partnership visibility"),
    },
    featuredNewsIds,
    footer: {
      description: text(footer.description, "Footer text", 10, 300),
      telegramUrl,
      supportEmail,
    },
    marketWarning: text(root.marketWarning, "Market warning", 40, 600),
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SiteContentError(`${label} must be an object.`, "INVALID");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, minimum: number, maximum: number): string {
  if (typeof value !== "string") throw new SiteContentError(`${label} must be text.`, "INVALID");
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new SiteContentError(`${label} must be ${minimum} to ${maximum} characters.`, "INVALID");
  }
  return normalized;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new SiteContentError(`${label} must be boolean.`, "INVALID");
  return value;
}

function stripView(view: SiteContentView): SiteContentSettings {
  return {
    environmentalMissionsEnabled: view.environmentalMissionsStoredEnabled,
    banner: view.banner,
    hero: view.hero,
    home: view.home,
    featuredNewsIds: view.featuredNewsIds,
    footer: view.footer,
    marketWarning: view.marketWarning,
  };
}

function changedPaths(oldValue: SiteContentSettings, newValue: SiteContentSettings): string[] {
  const paths: string[] = [];
  for (const key of Object.keys(newValue) as Array<keyof SiteContentSettings>) {
    if (JSON.stringify(oldValue[key]) !== JSON.stringify(newValue[key])) paths.push(key);
  }
  return paths;
}
