import "server-only";

import type { AdminDatabase } from "@/lib/admin/database";
import { getAdminDatabase } from "@/lib/admin/database";

export type NewsStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";

export interface NewsPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string;
  status: NewsStatus;
  categoryId: string | null;
  category: string | null;
  categorySlug: string | null;
  authorUserId: string | null;
  coverImage: string | null;
  featured: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  scheduledAt: number | null;
  publishedAt: number | null;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
  tags: Array<{ name: string; slug: string }>;
}

export interface NewsListFilters {
  query?: string;
  status?: NewsStatus;
  category?: string;
  tag?: string;
  limit?: number;
  page?: number;
  pageSize?: number;
}

export interface NewsHistoryEntry {
  id: number;
  action: string;
  actorEmail: string | null;
  snapshot: NewsPost;
  createdAt: number;
}

interface PostRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string;
  status: NewsStatus;
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  author_user_id: string | null;
  cover_image: string | null;
  featured: number;
  seo_title: string | null;
  seo_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  scheduled_at: number | null;
  published_at: number | null;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

const SELECT_POST = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug
  FROM news_posts p
  LEFT JOIN news_categories c ON c.id = p.category_id
`;

export class NewsRepository {
  constructor(
    private readonly database: AdminDatabase = getAdminDatabase(),
    private readonly now: () => number = Date.now,
  ) {}

  findById(id: string): NewsPost | null {
    const row = this.database.db.prepare(`${SELECT_POST} WHERE p.id = ?`).get(id) as PostRow | undefined;
    return row ? this.hydrate(row) : null;
  }

  findBySlug(slug: string): NewsPost | null {
    const row = this.database.db.prepare(`${SELECT_POST} WHERE p.slug = ?`).get(slug) as PostRow | undefined;
    return row ? this.hydrate(row) : null;
  }

  findVisibleBySlug(slug: string, now = this.now()): NewsPost | null {
    const row = this.database.db.prepare(`
      ${SELECT_POST}
      WHERE p.slug = ? AND (
        (p.status = 'PUBLISHED' AND p.published_at IS NOT NULL AND p.published_at <= ?)
        OR (p.status = 'SCHEDULED' AND p.scheduled_at IS NOT NULL AND p.scheduled_at <= ?)
      )
    `).get(slug, now, now) as PostRow | undefined;
    return row ? this.hydrate(row) : null;
  }

  listVisible(filters: NewsListFilters = {}, now = this.now()): NewsPost[] {
    const clauses = [`(
      (p.status = 'PUBLISHED' AND p.published_at IS NOT NULL AND p.published_at <= ?)
      OR (p.status = 'SCHEDULED' AND p.scheduled_at IS NOT NULL AND p.scheduled_at <= ?)
    )`];
    const values: Array<string | number> = [now, now];
    this.addContentFilters(clauses, values, filters);
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 100);
    values.push(limit);
    const rows = this.database.db.prepare(`
      ${SELECT_POST}
      WHERE ${clauses.join(" AND ")}
      ORDER BY p.featured DESC, COALESCE(p.published_at, p.scheduled_at) DESC, p.created_at DESC
      LIMIT ?
    `).all(...values) as PostRow[];
    return rows.map((row) => this.hydrate(row));
  }

  latest(limit = 3, now = this.now()): NewsPost[] {
    const rows = this.database.db.prepare(`
      ${SELECT_POST}
      WHERE (
        (p.status = 'PUBLISHED' AND p.published_at IS NOT NULL AND p.published_at <= ?)
        OR (p.status = 'SCHEDULED' AND p.scheduled_at IS NOT NULL AND p.scheduled_at <= ?)
      )
      ORDER BY COALESCE(p.published_at, p.scheduled_at) DESC, p.created_at DESC
      LIMIT ?
    `).all(now, now, Math.min(Math.max(limit, 1), 3)) as PostRow[];
    return rows.map((row) => this.hydrate(row));
  }

  visibleByIds(ids: string[], now = this.now()): NewsPost[] {
    if (!ids.length) return [];
    const limited = ids.slice(0, 3);
    const placeholders = limited.map(() => "?").join(",");
    const rows = this.database.db.prepare(`
      ${SELECT_POST}
      WHERE p.id IN (${placeholders}) AND (
        (p.status = 'PUBLISHED' AND p.published_at IS NOT NULL AND p.published_at <= ?)
        OR (p.status = 'SCHEDULED' AND p.scheduled_at IS NOT NULL AND p.scheduled_at <= ?)
      )
    `).all(...limited, now, now) as PostRow[];
    const posts = new Map(rows.map((row) => [row.id, this.hydrate(row)]));
    return limited.flatMap((id) => {
      const post = posts.get(id);
      return post ? [post] : [];
    });
  }

  listAdmin(filters: NewsListFilters = {}): NewsPost[] {
    return this.listAdminPage(filters).items;
  }

  listAdminPage(filters: NewsListFilters = {}): {
    items: NewsPost[];
    total: number;
    page: number;
    pageSize: number;
  } {
    const clauses: string[] = [];
    const values: Array<string | number> = [];
    if (filters.status) {
      clauses.push("p.status = ?");
      values.push(filters.status);
    }
    this.addContentFilters(clauses, values, filters);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const total = (this.database.db.prepare(
      `SELECT count(*) AS total
       FROM news_posts p
       LEFT JOIN news_categories c ON c.id = p.category_id
       ${where}`,
    ).get(...values) as { total: number }).total;
    const pageSize = Math.min(Math.max(filters.pageSize ?? filters.limit ?? 25, 1), 100);
    const page = Math.max(filters.page ?? 1, 1);
    const rows = this.database.db.prepare(`
      ${SELECT_POST}
      ${where}
      ORDER BY p.updated_at DESC
      LIMIT ? OFFSET ?
    `).all(...values, pageSize, (page - 1) * pageSize) as PostRow[];
    return { items: rows.map((row) => this.hydrate(row)), total, page, pageSize };
  }

  history(postId: string): NewsHistoryEntry[] {
    const rows = this.database.db.prepare(`
      SELECT h.id, h.action, h.snapshot_json, h.created_at, u.email AS actor_email
      FROM news_post_history h
      LEFT JOIN admin_users u ON u.id = h.actor_user_id
      WHERE h.post_id = ?
      ORDER BY h.created_at DESC, h.id DESC
    `).all(postId) as Array<{
      id: number; action: string; snapshot_json: string; created_at: number; actor_email: string | null;
    }>;
    return rows.flatMap((row) => {
      try {
        return [{
          id: row.id,
          action: row.action,
          actorEmail: row.actor_email,
          snapshot: JSON.parse(row.snapshot_json) as NewsPost,
          createdAt: row.created_at,
        }];
      } catch {
        return [];
      }
    });
  }

  slugExists(slug: string, excludingId?: string): boolean {
    const row = this.database.db.prepare(
      `SELECT 1 AS found FROM news_posts WHERE slug = ?${excludingId ? " AND id <> ?" : ""} LIMIT 1`,
    ).get(...(excludingId ? [slug, excludingId] : [slug])) as { found: number } | undefined;
    return Boolean(row);
  }

  categories(): Array<{ name: string; slug: string }> {
    return this.database.db.prepare(
      "SELECT name, slug FROM news_categories ORDER BY name",
    ).all() as Array<{ name: string; slug: string }>;
  }

  tags(): Array<{ name: string; slug: string }> {
    return this.database.db.prepare(
      "SELECT name, slug FROM news_tags ORDER BY name",
    ).all() as Array<{ name: string; slug: string }>;
  }

  private addContentFilters(
    clauses: string[],
    values: Array<string | number>,
    filters: NewsListFilters,
  ): void {
    if (filters.query?.trim()) {
      clauses.push("(p.title LIKE ? OR p.excerpt LIKE ? OR p.body LIKE ?)");
      const query = `%${filters.query.trim()}%`;
      values.push(query, query, query);
    }
    if (filters.category) {
      clauses.push("c.slug = ?");
      values.push(filters.category);
    }
    if (filters.tag) {
      clauses.push(`EXISTS (
        SELECT 1 FROM news_post_tags pt
        JOIN news_tags t ON t.id = pt.tag_id
        WHERE pt.post_id = p.id AND t.slug = ?
      )`);
      values.push(filters.tag);
    }
  }

  private hydrate(row: PostRow): NewsPost {
    const tags = this.database.db.prepare(`
      SELECT t.name, t.slug
      FROM news_tags t
      JOIN news_post_tags pt ON pt.tag_id = t.id
      WHERE pt.post_id = ?
      ORDER BY t.name
    `).all(row.id) as Array<{ name: string; slug: string }>;
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      body: row.body,
      status: row.status,
      categoryId: row.category_id,
      category: row.category_name,
      categorySlug: row.category_slug,
      authorUserId: row.author_user_id,
      coverImage: row.cover_image,
      featured: Boolean(row.featured),
      seoTitle: row.seo_title,
      seoDescription: row.seo_description,
      ogTitle: row.og_title,
      ogDescription: row.og_description,
      ogImage: row.og_image,
      scheduledAt: row.scheduled_at,
      publishedAt: row.published_at,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tags,
    };
  }
}

let singleton: NewsRepository | undefined;

export function getNewsRepository(): NewsRepository {
  singleton ??= new NewsRepository();
  return singleton;
}
