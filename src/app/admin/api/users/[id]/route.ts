import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin/admin-request";
import type { AdminRole } from "@/lib/admin/database";
import { AdminPermissionError } from "@/lib/admin/permissions";
import { AdminUserError, AdminUserService } from "@/lib/admin/users";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const authorization = await authorizeAdminApi(request, "admin.users.manage", true);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AdminUserError("Admin user not found.", "NOT_FOUND");
    const body = await boundedJson(request);
    const service = new AdminUserService();
    if (body.action === "revokeSessions") {
      return NextResponse.json({ revoked: service.revokeSessions(id, authorization.session.user) });
    }
    if (body.action !== "update") throw new AdminUserError("A valid action is required.", "INVALID");
    if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
      throw new AdminUserError("Active status must be a boolean.", "INVALID");
    }
    if (body.displayName !== undefined && body.displayName !== null && typeof body.displayName !== "string") {
      throw new AdminUserError("Display name must be text.", "INVALID");
    }
    if (body.passwordHash !== undefined && typeof body.passwordHash !== "string") {
      throw new AdminUserError("Password hash must be text.", "INVALID");
    }
    if (body.role !== undefined && typeof body.role !== "string") {
      throw new AdminUserError("Role must be text.", "INVALID");
    }
    const user = service.update(id, {
      role: body.role === undefined ? undefined : body.role as AdminRole,
      isActive: body.isActive as boolean | undefined,
      displayName: body.displayName === undefined ? undefined : body.displayName === null ? null : String(body.displayName),
      passwordHash: body.passwordHash === undefined ? undefined : String(body.passwordHash),
    }, authorization.session.user);
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof AdminUserError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    if (error instanceof AdminPermissionError) return NextResponse.json({ error: "Access denied." }, { status: 403 });
    return NextResponse.json({ error: "Unable to manage admin users." }, { status: 500 });
  }
}

async function boundedJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 8_192) throw new AdminUserError("Request body is too large.", "INVALID");
  const text = await request.text();
  if (text.length > 8_192) throw new AdminUserError("Request body is too large.", "INVALID");
  try { return JSON.parse(text) as Record<string, unknown>; } catch { throw new AdminUserError("Invalid JSON body.", "INVALID"); }
}
