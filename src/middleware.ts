import { NextResponse, type NextRequest } from "next/server";
import { recordPageView, shouldTrack } from "@/lib/analytics/service";

export const runtime = "nodejs";
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;
  if (shouldTrack(pathname, request.method, request.headers.get("accept"))) {
    const session = request.cookies.get("gtt_analytics_session")?.value ?? crypto.randomUUID();
    if (!request.cookies.get("gtt_analytics_session")) response.cookies.set("gtt_analytics_session", session, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1800, path: "/" });
    void recordPageView({ pathname: request.nextUrl.pathname + request.nextUrl.search, hostname: request.nextUrl.hostname, method: request.method, headers: request.headers, sessionId: session });
  }
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
