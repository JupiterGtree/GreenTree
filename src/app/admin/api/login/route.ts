import { NextResponse } from "next/server";
import { getAdminAuthService } from "@/lib/admin/auth";
import { toPublicAdminLoginResponse } from "@/lib/admin/auth-public";
import {
  getRequestIpAddress,
  hasValidSameOrigin,
  setAdminSessionCookie,
} from "@/lib/admin/request";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let credentials: { email?: unknown; password?: unknown };
  try {
    credentials = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof credentials.email !== "string" || typeof credentials.password !== "string") {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  if (credentials.email.length > 320 || credentials.password.length > 1_024) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  try {
    const result = getAdminAuthService().login({
      email: credentials.email,
      password: credentials.password,
      ipAddress: await getRequestIpAddress(),
      userAgent: request.headers.get("user-agent"),
    });

    const publicResult = toPublicAdminLoginResponse(result);
    if (!result.ok) {
      return NextResponse.json(publicResult.body, {
        status: publicResult.status,
        headers: publicResult.headers,
      });
    }

    const response = NextResponse.json(publicResult.body);
    setAdminSessionCookie(response, result.token, result.session.absoluteExpiresAt);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.json(
      { error: "Admin authentication is not configured." },
      { status: 503 },
    );
  }
}
