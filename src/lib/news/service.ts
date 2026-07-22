import "server-only";

import { randomUUID } from "node:crypto";
import { appendAdminAuditLog } from "@/lib/admin/audit";
import type { AdminDatabase } from "@/lib/admin/database";
import { getAdminDatabase } from "@/lib/admin/database";
import { NewsRepository, type NewsPost, type NewsStatus } from "./repository";

export interface NewsActor {
  id: string;
  email: string;
}

export interface NewsPostInput {
  title: string;
  slug?: string;
  excerpt?: string | null;
  body: string;
  category?: string | null;
  tags?: string[];
  coverImage?: string | null;
  featured?: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
}

export class NewsValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join(" "));
    this.name = "NewsValidationError";
  }
}

export class NewsService {
  readonly repository: NewsRepository;

  constructor(
    private readonly database: AdminDatabase = getAdminDatabase(),
    private readonly now: () => number = Date.now,
  ) {
    this.repository = new NewsRepository(database, now);
  }

  create(input: NewsPostInput, actor: NewsActor): NewsPost {
    const normalized = this.validate(input);
    const now = this.now();
    const id = randomUUID();
    const slug = this.uniqueSlug(normalized.slug || normalized.title);
    this.database.transaction(() => {
      const categoryId = this.upsertCategory(normalized.category, now);
      this.database.db.prepare(`
        INSERT INTO news_posts (
          id, title, slug, excerpt, body, status, category_id, author_user_id,
          cover_image, featured, seo_title, seo_description, og_title,
          og_description, og_image, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, normalized.title, slug, normalized.excerpt, normalized.body, categoryId,
        actor.id, normalized.coverImage, normalized.featured ? 1 : 0,
        normalized.seoTitle, normalized.seoDescription, normalized.ogTitle,
        normalized.ogDescription, normalized.ogImage, now, now,
      );
      this.replaceTags(id, normalized.tags, now);
      this.recordHistory(id, "CREATED", actor, now);
      this.audit("NEWS_CREATED", id, actor, { slug });
    });
    return this.mustFind(id);
  }

  edit(id: string, input: NewsPostInput, actor: NewsActor): NewsPost {
    const current = this.mustFind(id);
    const normalized = this.validate(input);
    const now = this.now();
    const slug = this.uniqueSlug(normalized.slug || normalized.title, id);
    this.database.transaction(() => {
      const categoryId = this.upsertCategory(normalized.category, now);
      this.database.db.prepare(`
        UPDATE news_posts SET
          title = ?, slug = ?, excerpt = ?, body = ?, category_id = ?,
          cover_image = ?, featured = ?, seo_title = ?, seo_description = ?,
          og_title = ?, og_description = ?, og_image = ?, updated_at = ?
        WHERE id = ?
      `).run(
        normalized.title, slug, normalized.excerpt, normalized.body, categoryId,
        normalized.coverImage, normalized.featured ? 1 : 0, normalized.seoTitle,
        normalized.seoDescription, normalized.ogTitle, normalized.ogDescription,
        normalized.ogImage, now, id,
      );
      this.replaceTags(id, normalized.tags, now);
      this.recordHistory(id, "EDITED", actor, now);
      this.audit("NEWS_EDITED", id, actor, { previousSlug: current.slug, slug });
    });
    return this.mustFind(id);
  }

  publish(id: string, actor: NewsActor): NewsPost {
    return this.transition(id, "PUBLISHED", actor, {
      publishedAt: this.now(),
      scheduledAt: null,
      archivedAt: null,
    });
  }

  unpublish(id: string, actor: NewsActor): NewsPost {
    return this.transition(id, "DRAFT", actor, {
      publishedAt: null,
      scheduledAt: null,
      archivedAt: null,
    });
  }

  schedule(id: string, scheduledAt: number, actor: NewsActor): NewsPost {
    if (!Number.isSafeInteger(scheduledAt) || scheduledAt <= this.now()) {
      throw new NewsValidationError(["Schedule time must be in the future."]);
    }
    return this.transition(id, "SCHEDULED", actor, {
      scheduledAt,
      publishedAt: null,
      archivedAt: null,
    });
  }

  archive(id: string, actor: NewsActor): NewsPost {
    return this.transition(id, "ARCHIVED", actor, {
      archivedAt: this.now(),
      scheduledAt: null,
    });
  }

  duplicateAsDraft(id: string, actor: NewsActor): NewsPost {
    const source = this.mustFind(id);
    const duplicate = this.create({
      title: `${source.title} (Copy)`,
      slug: `${source.slug}-copy`,
      excerpt: source.excerpt,
      body: source.body,
      category: source.category,
      tags: source.tags.map((tag) => tag.name),
      coverImage: source.coverImage,
      featured: false,
      seoTitle: source.seoTitle,
      seoDescription: source.seoDescription,
      ogTitle: source.ogTitle,
      ogDescription: source.ogDescription,
      ogImage: source.ogImage,
    }, actor);
    this.database.transaction(() => {
      this.recordHistory(duplicate.id, "DUPLICATED", actor, this.now());
      this.audit("NEWS_DUPLICATED", duplicate.id, actor, { sourceId: id });
    });
    return duplicate;
  }

  private transition(
    id: string,
    status: NewsStatus,
    actor: NewsActor,
    times: { publishedAt?: number | null; scheduledAt?: number | null; archivedAt?: number | null },
  ): NewsPost {
    const current = this.mustFind(id);
    const now = this.now();
    this.database.transaction(() => {
      this.database.db.prepare(`
        UPDATE news_posts SET status = ?, published_at = ?, scheduled_at = ?,
          archived_at = ?, updated_at = ? WHERE id = ?
      `).run(
        status,
        times.publishedAt === undefined ? current.publishedAt : times.publishedAt,
        times.scheduledAt === undefined ? current.scheduledAt : times.scheduledAt,
        times.archivedAt === undefined ? current.archivedAt : times.archivedAt,
        now,
        id,
      );
      this.recordHistory(id, status, actor, now);
      this.audit(`NEWS_${status}`, id, actor, { from: current.status, to: status });
    });
    return this.mustFind(id);
  }

  private validate(input: NewsPostInput): Required<Omit<NewsPostInput, "slug">> & { slug: string } {
    const title = input.title?.trim() ?? "";
    const body = input.body?.trim() ?? "";
    const excerpt = cleanOptional(input.excerpt);
    const category = cleanOptional(input.category);
    const tags = [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
    const issues: string[] = [];
    if (title.length < 3 || title.length > 180) issues.push("Title must contain 3–180 characters.");
    if (!body || body.length > 100_000) issues.push("Body is required and must not exceed 100,000 characters.");
    if (excerpt && excerpt.length > 500) issues.push("Excerpt must not exceed 500 characters.");
    if (category && category.length > 80) issues.push("Category must not exceed 80 characters.");
    if (tags.length > 20 || tags.some((tag) => tag.length > 50)) issues.push("Use at most 20 tags of 50 characters each.");
    const coverImage = validateUrl(input.coverImage, "Cover image", issues);
    const ogImage = validateUrl(input.ogImage, "Open Graph image", issues);
    const seoTitle = limited(input.seoTitle, 70, "SEO title", issues);
    const seoDescription = limited(input.seoDescription, 170, "SEO description", issues);
    const ogTitle = limited(input.ogTitle, 100, "Open Graph title", issues);
    const ogDescription = limited(input.ogDescription, 250, "Open Graph description", issues);
    const slug = slugify(input.slug || title);
    if (!slug || slug.length > 180) issues.push("Slug must contain URL-safe words and be at most 180 characters.");
    if (issues.length) throw new NewsValidationError(issues);
    return {
      title, slug, excerpt, body, category, tags, coverImage,
      featured: Boolean(input.featured), seoTitle, seoDescription,
      ogTitle, ogDescription, ogImage,
    };
  }

  private uniqueSlug(value: string, excludingId?: string): string {
    const base = slugify(value) || "news";
    let candidate = base;
    let suffix = 2;
    while (this.repository.slugExists(candidate, excludingId)) {
      candidate = `${base}-${suffix++}`;
    }
    return candidate;
  }

  private upsertCategory(name: string | null, now: number): string | null {
    if (!name) return null;
    const slug = slugify(name);
    const existing = this.database.db.prepare(
      "SELECT id FROM news_categories WHERE slug = ?",
    ).get(slug) as { id: string } | undefined;
    if (existing) return existing.id;
    const id = randomUUID();
    this.database.db.prepare(`
      INSERT INTO news_categories (id, name, slug, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, slug, now, now);
    return id;
  }

  private replaceTags(postId: string, names: string[], now: number): void {
    this.database.db.prepare("DELETE FROM news_post_tags WHERE post_id = ?").run(postId);
    for (const name of names) {
      const slug = slugify(name);
      let row = this.database.db.prepare("SELECT id FROM news_tags WHERE slug = ?").get(slug) as
        | { id: string }
        | undefined;
      if (!row) {
        row = { id: randomUUID() };
        this.database.db.prepare(`
          INSERT INTO news_tags (id, name, slug, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(row.id, name, slug, now, now);
      }
      this.database.db.prepare(
        "INSERT INTO news_post_tags (post_id, tag_id) VALUES (?, ?)",
      ).run(postId, row.id);
    }
  }

  private mustFind(id: string): NewsPost {
    const post = this.repository.findById(id);
    if (!post) throw new NewsValidationError(["News post was not found."]);
    return post;
  }

  private recordHistory(id: string, action: string, actor: NewsActor, createdAt: number): void {
    const snapshot = this.mustFind(id);
    this.database.db.prepare(`
      INSERT INTO news_post_history
        (post_id, actor_user_id, action, snapshot_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, actor.id, action, JSON.stringify(snapshot), createdAt);
  }

  private audit(action: string, id: string, actor: NewsActor, metadata?: Record<string, unknown>): void {
    appendAdminAuditLog(this.database, {
      actorUserId: actor.id,
      actorEmail: actor.email,
      action,
      targetType: "news_post",
      targetId: id,
      metadata,
      createdAt: this.now(),
    });
  }
}

function cleanOptional(value: string | null | undefined): string | null {
  const clean = value?.trim() ?? "";
  return clean || null;
}

function limited(
  value: string | null | undefined,
  max: number,
  label: string,
  issues: string[],
): string | null {
  const clean = cleanOptional(value);
  if (clean && clean.length > max) issues.push(`${label} must not exceed ${max} characters.`);
  return clean;
}

function validateUrl(
  value: string | null | undefined,
  label: string,
  issues: string[],
): string | null {
  const clean = cleanOptional(value);
  if (!clean) return null;
  if (clean.length > 2_048) {
    issues.push(`${label} URL must not exceed 2,048 characters.`);
    return clean;
  }
  if (clean.startsWith("/") && !clean.startsWith("//")) return clean;
  try {
    const url = new URL(clean);
    if (url.protocol === "https:" && !url.username && !url.password && url.hostname) return clean;
  } catch {
    // Report a common validation error below.
  }
  issues.push(`${label} must be a root-relative or HTTPS URL.`);
  return clean;
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}
