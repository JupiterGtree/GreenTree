import { NextResponse } from "next/server";
import { getAdminAuthService } from "@/lib/admin/auth";
import {
  clearAdminSessionCookie,
  getRequestIpAddress,
  hasValidSameOrigin,
  readAdminSessionToken,
} from "@/lib/admin/request";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const token = await readAdminSessionToken();
  if (!token) return loggedOutResponse(request);

  let csrfToken = request.headers.get("x-csrf-token") ?? "";
  if (!csrfToken && request.headers.get("content-type")?.includes("form")) {
    const form = await request.formData();
    const value = form.get("csrfToken");
    csrfToken = typeof value === "string" ? value : "";
  }

  const auth = getAdminAuthService();
  if (!auth.verifyCsrf(token, csrfToken)) {
    return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
  }

  auth.logout(token, await getRequestIpAddress());
  return loggedOutResponse(request);
}

function loggedOutResponse(request: Request): NextResponse {
  const acceptsHtml = request.headers.get("accept")?.includes("text/html");
  const response = acceptsHtml
    ? NextResponse.redirect(new URL("/admin/login", request.url), 303)
    : NextResponse.json({ ok: true });
  clearAdminSessionCookie(response);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
