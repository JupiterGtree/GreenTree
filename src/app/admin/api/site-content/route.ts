import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin/admin-request";
import { AdminPermissionError } from "@/lib/admin/permissions";
import { SiteContentError, SiteContentService } from "@/lib/admin/site-content";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 16_384;

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = await authorizeAdminApi(request, "admin.settings.manage", false);
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }
  return NextResponse.json(
    { settings: new SiteContentService().get() },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function PUT(request: Request): Promise<NextResponse> {
  const authorization = await authorizeAdminApi(request, "admin.settings.manage", true);
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }
  try {
    const body = await boundedJson(request);
    if (typeof body.reason !== "string") {
      throw new SiteContentError("A reason is required.", "INVALID");
    }
    const settings = new SiteContentService().update(
      body.settings,
      body.reason,
      authorization.session.user,
      typeof body.confirmation === "string" ? body.confirmation : undefined,
    );
    return NextResponse.json({ settings }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AdminPermissionError) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
    if (error instanceof SiteContentError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to update site content." }, { status: 500 });
  }
}

async function boundedJson(request: Request): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new SiteContentError("Request body is too large.", "INVALID");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new SiteContentError("Request body is too large.", "INVALID");
  }
  try {
    const body = JSON.parse(text) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new SiteContentError("Invalid JSON body.", "INVALID");
  }
}
