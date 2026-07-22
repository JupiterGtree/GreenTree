import "server-only";

import { getAdminAuthService, type AdminSession } from "./auth";
import { hasAdminPermission } from "./permissions";
import { hasValidSameOrigin, readAdminSessionToken } from "./request";

type Authorization =
  | { ok: true; session: AdminSession }
  | { ok: false; status: number; error: string };

export async function authorizePartnershipRequest(
  request: Request,
  write = false,
): Promise<Authorization> {
  if (write && !hasValidSameOrigin(request)) {
    return { ok: false, status: 403, error: "Invalid request origin." };
  }
  const token = await readAdminSessionToken();
  const auth = getAdminAuthService();
  if (!token) return { ok: false, status: 401, error: "Session expired." };
  if (write && !auth.verifyCsrf(token, request.headers.get("x-csrf-token") ?? "")) {
    return { ok: false, status: 401, error: "Session expired." };
  }
  const session = auth.authenticate(token, false);
  if (!session) return { ok: false, status: 401, error: "Session expired." };
  const permission = write ? "partnerships.write" : "partnerships.read";
  if (!hasAdminPermission(session.user.role, permission)) {
    return { ok: false, status: 403, error: write ? "Administrator access is required." : "Access denied." };
  }
  return { ok: true, session };
}
