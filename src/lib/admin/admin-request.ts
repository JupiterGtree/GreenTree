import "server-only";

import { getAdminAuthService, type AdminAuthService, type AdminSession } from "./auth";
import type { AdminPermission } from "./permissions";
import { hasAdminPermission } from "./permissions";
import { hasValidSameOrigin, readAdminSessionToken } from "./request";

type Authorization =
  | { ok: true; session: AdminSession }
  | { ok: false; status: number; error: string };

export async function authorizeAdminApi(
  request: Request,
  permission: AdminPermission,
  write: boolean,
): Promise<Authorization> {
  if (write && !hasValidSameOrigin(request)) {
    return { ok: false, status: 403, error: "Invalid request origin." };
  }
  const token = await readAdminSessionToken();
  const auth = getAdminAuthService();
  if (!token || (write && !auth.verifyCsrf(token, request.headers.get("x-csrf-token") ?? ""))) {
    return { ok: false, status: 401, error: "Session expired." };
  }
  return authorizeAuthenticatedAdmin(auth, token, permission);
}

export function authorizeAuthenticatedAdmin(
  auth: AdminAuthService,
  token: string | null,
  permission: AdminPermission,
): Authorization {
  if (!token) return { ok: false, status: 401, error: "Session expired." };
  const session = auth.authenticate(token, false);
  if (!session) return { ok: false, status: 401, error: "Session expired." };
  if (!hasAdminPermission(session.user.role, permission)) {
    return { ok: false, status: 403, error: "Access denied." };
  }
  return { ok: true, session };
}
