import { NextResponse } from "next/server";
import { getAdminAuthService } from "@/lib/admin/auth";
import {
  clearAdminSessionCookie,
  hasValidSameOrigin,
  readAdminSessionToken,
  setAdminSessionCookie,
} from "@/lib/admin/request";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const token = await readAdminSessionToken();
  const authenticated = Boolean(token && getAdminAuthService().authenticate(token, false));
  return NextResponse.json(
    { authenticated },
    { status: authenticated ? 200 : 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const token = await readAdminSessionToken();
  const csrfToken = request.headers.get("x-csrf-token") ?? "";
  const auth = getAdminAuthService();
  if (!token || !auth.verifyCsrf(token, csrfToken)) {
    const response = NextResponse.json({ error: "Session expired." }, { status: 401 });
    clearAdminSessionCookie(response);
    return response;
  }

  const session = auth.authenticate(token, true);
  if (!session) {
    const response = NextResponse.json({ error: "Session expired." }, { status: 401 });
    clearAdminSessionCookie(response);
    return response;
  }

  const response = NextResponse.json({ ok: true, csrfToken: session.csrfToken });
  if (session.rotatedToken) {
    setAdminSessionCookie(response, session.rotatedToken, session.absoluteExpiresAt);
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
