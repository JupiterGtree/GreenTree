import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin/admin-request";
import { AdminPermissionError } from "@/lib/admin/permissions";
import { AdminUserError, AdminUserService, type AdminUserView } from "@/lib/admin/users";
import type { AdminRole } from "@/lib/admin/database";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = await authorizeAdminApi(request, "admin.users.manage", false);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  return NextResponse.json({ users: new AdminUserService().list(authorization.session.user) }, {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const authorization = await authorizeAdminApi(request, "admin.users.manage", true);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  try {
    const body = await boundedJson(request);
    if (
      typeof body.email !== "string" ||
      typeof body.role !== "string" ||
      typeof body.passwordHash !== "string" ||
      (body.displayName !== undefined && body.displayName !== null && typeof body.displayName !== "string")
    ) {
      throw new AdminUserError("Email, role, and encoded password hash are required.", "INVALID");
    }
    const user: AdminUserView = new AdminUserService().create({
      email: body.email, displayName: optionalString(body.displayName),
      role: body.role as AdminRole, passwordHash: body.passwordHash,
    }, authorization.session.user);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return userError(error);
  }
}

async function boundedJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 8_192) throw new AdminUserError("Request body is too large.", "INVALID");
  const text = await request.text();
  if (text.length > 8_192) throw new AdminUserError("Request body is too large.", "INVALID");
  try { return JSON.parse(text) as Record<string, unknown>; } catch { throw new AdminUserError("Invalid JSON body.", "INVALID"); }
}

function optionalString(value: unknown): string | null | undefined {
  return value === null || value === undefined ? value : String(value);
}

export function userError(error: unknown): NextResponse {
  if (error instanceof AdminUserError) {
    const status = error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  if (error instanceof AdminPermissionError) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  return NextResponse.json({ error: "Unable to manage admin users." }, { status: 500 });
}

