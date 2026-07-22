import "server-only";

import { getAdminAuthService, type AdminSession } from "./auth";
import { hasAdminPermission } from "./permissions";
import { hasValidSameOrigin, readAdminSessionToken } from "./request";

export async function authorizeNewsWrite(request: Request): Promise<
  { ok: true; session: AdminSession } | { ok: false; status: number; error: string }
> {
  if (!hasValidSameOrigin(request)) return { ok: false, status: 403, error: "Invalid request origin." };
  const token = await readAdminSessionToken();
  const csrf = request.headers.get("x-csrf-token") ?? "";
  const auth = getAdminAuthService();
  if (!token || !auth.verifyCsrf(token, csrf)) {
    return { ok: false, status: 401, error: "Session expired." };
  }
  const session = auth.authenticate(token, false);
  if (!session) return { ok: false, status: 401, error: "Session expired." };
  if (!hasAdminPermission(session.user.role, "news.write")) {
    return { ok: false, status: 403, error: "Editor access is required." };
  }
  return { ok: true, session };
}
