import "server-only";

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

// @ts-expect-error node:sqlite is available in Node 22.5+, ahead of the configured Node 20 types.
import { DatabaseSync } from "node:sqlite";

export type AdminRole = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";

export interface AdminDatabaseOptions {
  path?: string;
  bootstrapEmail?: string;
  bootstrapPasswordHash?: string;
  now?: () => number;
}

export type AdminSqliteDatabase = InstanceType<typeof DatabaseSync>;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER')),
    display_name TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    last_login_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    csrf_secret TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    idle_expires_at INTEGER NOT NULL,
    absolute_expires_at INTEGER NOT NULL,
    rotated_at INTEGER NOT NULL,
    revoked_at INTEGER,
    user_agent_hash TEXT
  );

  CREATE TABLE IF NOT EXISTS admin_login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_normalized TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    succeeded INTEGER NOT NULL CHECK (succeeded IN (0, 1)),
    failure_reason TEXT,
    attempted_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
    actor_email TEXT,
    actor_role TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    metadata_json TEXT,
    ip_hash TEXT,
    public_id TEXT UNIQUE,
    result TEXT NOT NULL DEFAULT 'SUCCESS',
    user_agent_summary TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS news_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS news_tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS news_posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    excerpt TEXT,
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED')),
    category_id TEXT REFERENCES news_categories(id) ON DELETE SET NULL,
    author_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
    cover_image TEXT,
    featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
    seo_title TEXT,
    seo_description TEXT,
    og_title TEXT,
    og_description TEXT,
    og_image TEXT,
    scheduled_at INTEGER,
    published_at INTEGER,
    archived_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS news_post_tags (
    post_id TEXT NOT NULL REFERENCES news_posts(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES news_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS partnership_requests (
    id TEXT PRIMARY KEY,
    request_number TEXT NOT NULL UNIQUE,
    applicant_name TEXT NOT NULL,
    organization_name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
      'COMMUNITY', 'MARKETING', 'TECHNOLOGY', 'ENVIRONMENTAL', 'LIQUIDITY',
      'MEDIA', 'EXCHANGE', 'RESEARCH', 'OTHER'
    )),
    website TEXT,
    website_host TEXT,
    x_display TEXT,
    x_handle TEXT,
    telegram_display TEXT,
    telegram_handle TEXT,
    email TEXT,
    preferred_contact_type TEXT CHECK (
      preferred_contact_type IS NULL OR preferred_contact_type IN ('X', 'TELEGRAM', 'EMAIL')
    ),
    introduction TEXT NOT NULL,
    collaboration TEXT NOT NULL,
    supporting_link TEXT,
    consent INTEGER NOT NULL CHECK (consent IN (0, 1)),
    fingerprint TEXT NOT NULL UNIQUE,
    contact_fingerprint TEXT NOT NULL,
    material_fingerprint TEXT NOT NULL,
    duplicate_of TEXT REFERENCES partnership_requests(id) ON DELETE SET NULL,
    allow_resubmission INTEGER NOT NULL DEFAULT 0 CHECK (allow_resubmission IN (0, 1)),
    ip_hash TEXT NOT NULL,
    unread INTEGER NOT NULL DEFAULT 1 CHECK (unread IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'NEW' CHECK (
      status IN ('NEW', 'REVIEWING', 'CONTACTED', 'ACCEPTED', 'REJECTED', 'ARCHIVED')
    ),
    assigned_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
    submitted_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS partnership_request_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL REFERENCES partnership_requests(id) ON DELETE CASCADE,
    actor_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    metadata_json TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS partnership_internal_notes (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL REFERENCES partnership_requests(id) ON DELETE CASCADE,
    author_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS support_requests (
    id TEXT PRIMARY KEY,
    request_number TEXT NOT NULL UNIQUE,
    requester_name TEXT NOT NULL,
    reply_email TEXT NOT NULL,
    topic TEXT NOT NULL CHECK (topic IN ('PURCHASE', 'WEBSITE', 'GENERAL')),
    message TEXT NOT NULL,
    fingerprint TEXT NOT NULL UNIQUE,
    ip_hash TEXT NOT NULL,
    unread INTEGER NOT NULL DEFAULT 1 CHECK (unread IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'NEW' CHECK (
      status IN ('NEW', 'REVIEWING', 'RESPONDED', 'RESOLVED', 'CLOSED')
    ),
    assigned_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
    submitted_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS support_request_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
    actor_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    metadata_json TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS support_internal_notes (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
    author_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_runtime_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    description TEXT,
    updated_by_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_setting_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT NOT NULL,
    previous_value_json TEXT,
    new_value_json TEXT NOT NULL,
    changed_by_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
    changed_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(idle_expires_at, absolute_expires_at);
  CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_limit
    ON admin_login_attempts(email_normalized, ip_hash, attempted_at);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_news_posts_status ON news_posts(status, published_at);
  CREATE INDEX IF NOT EXISTS idx_partnership_status ON partnership_requests(status, submitted_at);
  CREATE INDEX IF NOT EXISTS idx_partnership_events_request
    ON partnership_request_events(request_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_partnership_notes_request
    ON partnership_internal_notes(request_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_support_status ON support_requests(status, submitted_at);
  CREATE INDEX IF NOT EXISTS idx_support_ip_rate ON support_requests(ip_hash, submitted_at);
  CREATE INDEX IF NOT EXISTS idx_support_events_request
    ON support_request_events(request_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_support_notes_request
    ON support_internal_notes(request_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_setting_history_key
    ON admin_setting_history(setting_key, changed_at);
`;

export class AdminDatabase {
  readonly db: AdminSqliteDatabase;
  private readonly now: () => number;

  constructor(options: AdminDatabaseOptions = {}) {
    const databasePath = options.path ?? process.env.ADMIN_DB_PATH ?? resolve(process.cwd(), "data", "admin.db");
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });

    this.db = new DatabaseSync(databasePath);
    this.now = options.now ?? Date.now;
    this.configure();
    this.db.exec(SCHEMA);
    this.migrateAuditSchema();
    this.migrateNewsSchema();
    this.ensureNewsHistorySchema();
    this.migratePartnershipSchema();
    this.migrateTelegramSchema();
    this.bootstrapOwner(
      options.bootstrapEmail ?? process.env.ADMIN_BOOTSTRAP_EMAIL,
      options.bootstrapPasswordHash ?? process.env.ADMIN_PASSWORD_HASH,
    );
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private configure(): void {
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = NORMAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  private migrateAuditSchema(): void {
    const columns = this.db.prepare("PRAGMA table_info(admin_audit_logs)").all() as Array<{ name: string }>;
    const additions: Array<[string, string]> = [
      ["actor_role", "TEXT"],
      ["public_id", "TEXT"],
      ["result", "TEXT NOT NULL DEFAULT 'SUCCESS'"],
      ["user_agent_summary", "TEXT"],
    ];
    for (const [name, definition] of additions) {
      if (!columns.some((column) => column.name === name)) {
        this.db.exec(`ALTER TABLE admin_audit_logs ADD COLUMN ${name} ${definition}`);
      }
    }
    this.db.exec(`
      UPDATE admin_audit_logs SET public_id = lower(hex(randomblob(16))) WHERE public_id IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_audit_public_id ON admin_audit_logs(public_id);
      CREATE INDEX IF NOT EXISTS idx_admin_audit_filters
        ON admin_audit_logs(action, target_type, result, created_at);
      CREATE TRIGGER IF NOT EXISTS admin_audit_logs_no_update
        BEFORE UPDATE ON admin_audit_logs
        BEGIN SELECT RAISE(ABORT, 'admin audit logs are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS admin_audit_logs_no_delete
        BEFORE DELETE ON admin_audit_logs
        BEGIN SELECT RAISE(ABORT, 'admin audit logs are append-only'); END;
    `);
  }

  private migrateNewsSchema(): void {
    const columns = this.db.prepare("PRAGMA table_info(news_posts)").all() as Array<{ name: string }>;
    const sql = (this.db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'news_posts'",
    ).get() as { sql?: string } | undefined)?.sql ?? "";
    const required = [
      "cover_image", "featured", "seo_title", "seo_description", "og_title",
      "og_description", "og_image", "scheduled_at", "archived_at",
    ];
    if (required.every((name) => columns.some((column) => column.name === name)) && sql.includes("'SCHEDULED'")) {
      return;
    }

    this.db.exec("PRAGMA foreign_keys = OFF");
    try {
      this.db.exec(`
        BEGIN IMMEDIATE;
        ALTER TABLE news_post_tags RENAME TO news_post_tags_legacy;
        ALTER TABLE news_posts RENAME TO news_posts_legacy;
        CREATE TABLE news_posts (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          excerpt TEXT,
          body TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'DRAFT'
            CHECK (status IN ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED')),
          category_id TEXT REFERENCES news_categories(id) ON DELETE SET NULL,
          author_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
          cover_image TEXT,
          featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
          seo_title TEXT,
          seo_description TEXT,
          og_title TEXT,
          og_description TEXT,
          og_image TEXT,
          scheduled_at INTEGER,
          published_at INTEGER,
          archived_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE news_post_tags (
          post_id TEXT NOT NULL REFERENCES news_posts(id) ON DELETE CASCADE,
          tag_id TEXT NOT NULL REFERENCES news_tags(id) ON DELETE CASCADE,
          PRIMARY KEY (post_id, tag_id)
        );
        INSERT INTO news_posts (
          id, title, slug, excerpt, body, status, category_id, author_user_id,
          published_at, created_at, updated_at
        )
        SELECT id, title, slug, excerpt, body, status, category_id, author_user_id,
               published_at, created_at, updated_at
        FROM news_posts_legacy;
        INSERT INTO news_post_tags (post_id, tag_id)
          SELECT post_id, tag_id FROM news_post_tags_legacy;
        DROP TABLE news_post_tags_legacy;
        DROP TABLE news_posts_legacy;
        CREATE INDEX IF NOT EXISTS idx_news_posts_status ON news_posts(status, published_at);
        COMMIT;
      `);
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // The migration may have failed before a transaction was opened.
      }
      throw error;
    } finally {
      this.db.exec("PRAGMA foreign_keys = ON");
    }
  }

  private ensureNewsHistorySchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS news_post_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id TEXT NOT NULL REFERENCES news_posts(id) ON DELETE CASCADE,
        actor_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_news_history_post
        ON news_post_history(post_id, created_at);
    `);
  }

  private migratePartnershipSchema(): void {
    const columns = this.db.prepare("PRAGMA table_info(partnership_requests)").all() as Array<{ name: string }>;
    if (!columns.length) return;
    if (columns.some((column) => column.name === "request_number")) {
      if (!columns.some((column) => column.name === "preferred_contact_type")) {
        this.db.exec(`
          ALTER TABLE partnership_requests
          ADD COLUMN preferred_contact_type TEXT
          CHECK (preferred_contact_type IS NULL OR preferred_contact_type IN ('X', 'TELEGRAM', 'EMAIL'))
        `);
      }
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_partnership_contact_material
          ON partnership_requests(contact_fingerprint, material_fingerprint, submitted_at);
        CREATE INDEX IF NOT EXISTS idx_partnership_ip_rate
          ON partnership_requests(ip_hash, submitted_at);
      `);
      return;
    }

    this.db.exec("PRAGMA foreign_keys = OFF");
    try {
      this.db.exec(`
        BEGIN IMMEDIATE;
        ALTER TABLE partnership_request_events RENAME TO partnership_request_events_legacy;
        ALTER TABLE partnership_internal_notes RENAME TO partnership_internal_notes_legacy;
        ALTER TABLE partnership_requests RENAME TO partnership_requests_legacy;
        CREATE TABLE partnership_requests (
          id TEXT PRIMARY KEY,
          request_number TEXT NOT NULL UNIQUE,
          applicant_name TEXT NOT NULL,
          organization_name TEXT NOT NULL,
          category TEXT NOT NULL CHECK (category IN (
            'COMMUNITY', 'MARKETING', 'TECHNOLOGY', 'ENVIRONMENTAL', 'LIQUIDITY',
            'MEDIA', 'EXCHANGE', 'RESEARCH', 'OTHER'
          )),
          website TEXT, website_host TEXT, x_display TEXT, x_handle TEXT,
          telegram_display TEXT, telegram_handle TEXT, email TEXT,
          preferred_contact_type TEXT CHECK (
            preferred_contact_type IS NULL OR preferred_contact_type IN ('X', 'TELEGRAM', 'EMAIL')
          ),
          introduction TEXT NOT NULL, collaboration TEXT NOT NULL,
          supporting_link TEXT,
          consent INTEGER NOT NULL CHECK (consent IN (0, 1)),
          fingerprint TEXT NOT NULL UNIQUE,
          contact_fingerprint TEXT NOT NULL,
          material_fingerprint TEXT NOT NULL,
          duplicate_of TEXT REFERENCES partnership_requests(id) ON DELETE SET NULL,
          allow_resubmission INTEGER NOT NULL DEFAULT 0 CHECK (allow_resubmission IN (0, 1)),
          ip_hash TEXT NOT NULL,
          unread INTEGER NOT NULL DEFAULT 1 CHECK (unread IN (0, 1)),
          status TEXT NOT NULL DEFAULT 'NEW' CHECK (
            status IN ('NEW', 'REVIEWING', 'CONTACTED', 'ACCEPTED', 'REJECTED', 'ARCHIVED')
          ),
          assigned_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
          submitted_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE partnership_request_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          request_id TEXT NOT NULL REFERENCES partnership_requests(id) ON DELETE CASCADE,
          actor_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
          event_type TEXT NOT NULL, from_status TEXT, to_status TEXT,
          metadata_json TEXT, created_at INTEGER NOT NULL
        );
        CREATE TABLE partnership_internal_notes (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL REFERENCES partnership_requests(id) ON DELETE CASCADE,
          author_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
          body TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        );
        INSERT INTO partnership_requests (
          id, request_number, applicant_name, organization_name, category, email,
          introduction, collaboration, consent, fingerprint, contact_fingerprint,
          material_fingerprint, ip_hash, status, assigned_user_id, submitted_at, updated_at
        )
        SELECT id, 'GTP-LEGACY-' || substr(replace(id, '-', ''), 1, 8),
          contact_name, organization_name, 'OTHER', nullif(lower(trim(contact_email)), ''),
          '', message, 1, 'legacy:' || id, 'legacy-contact:' || id,
          'legacy-material:' || id, 'legacy', 
          CASE WHEN status IN ('NEW','REVIEWING','CONTACTED','ACCEPTED','REJECTED','ARCHIVED')
            THEN status ELSE 'NEW' END,
          assigned_user_id, submitted_at, updated_at
        FROM partnership_requests_legacy;
        INSERT INTO partnership_request_events
          (id, request_id, actor_user_id, event_type, from_status, to_status, metadata_json, created_at)
          SELECT id, request_id, actor_user_id, event_type, from_status, to_status, metadata_json, created_at
          FROM partnership_request_events_legacy;
        INSERT INTO partnership_internal_notes
          (id, request_id, author_user_id, body, created_at, updated_at)
          SELECT id, request_id, author_user_id, body, created_at, updated_at
          FROM partnership_internal_notes_legacy;
        DROP TABLE partnership_request_events_legacy;
        DROP TABLE partnership_internal_notes_legacy;
        DROP TABLE partnership_requests_legacy;
        CREATE INDEX idx_partnership_status ON partnership_requests(status, submitted_at);
        CREATE INDEX idx_partnership_contact_material
          ON partnership_requests(contact_fingerprint, material_fingerprint, submitted_at);
        CREATE INDEX idx_partnership_ip_rate ON partnership_requests(ip_hash, submitted_at);
        CREATE INDEX idx_partnership_events_request
          ON partnership_request_events(request_id, created_at);
        CREATE INDEX idx_partnership_notes_request
          ON partnership_internal_notes(request_id, created_at);
        COMMIT;
      `);
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* Transaction may not be open. */ }
      throw error;
    } finally {
      this.db.exec("PRAGMA foreign_keys = ON");
    }
  }

  private migrateTelegramSchema(): void {
    const supportColumns = this.db.prepare("PRAGMA table_info(support_requests)").all() as Array<{ name: string }>;
    if (supportColumns.length && !supportColumns.some((column) => column.name === "channel")) {
      this.db.exec("ALTER TABLE support_requests ADD COLUMN channel TEXT NOT NULL DEFAULT 'WEB' CHECK (channel IN ('WEB', 'TELEGRAM'))");
      this.db.exec("ALTER TABLE support_requests ADD COLUMN telegram_user_hash TEXT");
      this.db.exec("ALTER TABLE support_requests ADD COLUMN telegram_username TEXT");
      this.db.exec("ALTER TABLE support_requests ADD COLUMN telegram_chat_hash TEXT");
      this.db.exec("ALTER TABLE support_requests ADD COLUMN telegram_chat_id TEXT");
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS telegram_updates (
        update_id INTEGER PRIMARY KEY, received_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS telegram_conversations (
        user_hash TEXT PRIMARY KEY, chat_id TEXT NOT NULL, username TEXT,
        state TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', expires_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS telegram_delivery_attempts (
        id TEXT PRIMARY KEY, support_request_id TEXT REFERENCES support_requests(id) ON DELETE CASCADE,
        quote_id TEXT, chat_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
        telegram_message_id INTEGER, error_summary TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS telegram_runtime_state (
        key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_telegram_delivery_status ON telegram_delivery_attempts(status, created_at);
    `);
  }

  private bootstrapOwner(email: string | undefined, passwordHash: string | undefined): void {
    if (!email && !passwordHash) return;
    if (!email || !passwordHash) {
      throw new Error("ADMIN_BOOTSTRAP_EMAIL and ADMIN_PASSWORD_HASH must be configured together.");
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !passwordHash.startsWith("scrypt$v=1$")) {
      throw new Error("Admin bootstrap credentials are invalid.");
    }

    const now = this.now();
    this.db.prepare(`
      INSERT INTO admin_users (
        id, email, password_hash, role, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, 'OWNER', 1, ?, ?)
      ON CONFLICT(email) DO NOTHING
    `).run(randomUUID(), normalizedEmail, passwordHash, now, now);
  }
}

let singleton: AdminDatabase | undefined;

export function getAdminDatabase(): AdminDatabase {
  singleton ??= new AdminDatabase();
  return singleton;
}

export function setAdminDatabaseForTests(database: AdminDatabase | undefined): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Admin database injection is restricted to tests.");
  }
  singleton = database;
}
