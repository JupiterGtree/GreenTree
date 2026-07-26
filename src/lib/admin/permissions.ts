import type { AdminRole } from "./database";

export type AdminPermission =
  | "admin.users.manage"
  | "admin.settings.manage"
  | "operations.read"
  | "audit.read"
  | "news.read"
  | "news.write"
  | "news.publish"
  | "partnerships.read"
  | "partnerships.write"
  | "support.read"
  | "support.write"
  | "token-distributions.view"
  | "token-distributions.create"
  | "token-distributions.confirm"
  | "token-distributions.cancel"
  | "token-distributions.export"
  | "token-receipts.view"
  | "token-receipts.create"
  | "token-receipts.import"
  | "token-receipts.reverify"
  | "token-receipts.revoke";

const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<AdminPermission>> = {
  OWNER: new Set([
    "admin.users.manage",
    "admin.settings.manage",
    "operations.read",
    "audit.read",
    "news.read",
    "news.write",
    "news.publish",
    "partnerships.read",
    "partnerships.write",
    "support.read",
    "support.write",
    "token-distributions.view",
    "token-distributions.create",
    "token-distributions.confirm",
    "token-distributions.cancel",
    "token-distributions.export",
    "token-receipts.view",
    "token-receipts.create",
    "token-receipts.import",
    "token-receipts.reverify",
    "token-receipts.revoke",
  ]),
  ADMIN: new Set([
    "admin.settings.manage",
    "operations.read",
    "audit.read",
    "news.read",
    "news.write",
    "news.publish",
    "partnerships.read",
    "partnerships.write",
    "support.read",
    "support.write",
  ]),
  EDITOR: new Set([
    "operations.read",
    "news.read",
    "news.write",
    "news.publish",
  ]),
  VIEWER: new Set(["operations.read", "news.read", "partnerships.read", "support.read"]),
};

export function hasAdminPermission(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function requireAdminPermission(role: AdminRole, permission: AdminPermission): void {
  if (!hasAdminPermission(role, permission)) {
    throw new AdminPermissionError(permission);
  }
}

export class AdminPermissionError extends Error {
  constructor(readonly permission: AdminPermission) {
    super(`Missing admin permission: ${permission}`);
    this.name = "AdminPermissionError";
  }
}
