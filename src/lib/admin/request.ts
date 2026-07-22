import "server-only";

import { cookies, headers } from "next/headers";
import type { NextResponse } from "next/server";
import type { AdminSession } from "./auth";
import { getAdminAuthService } from "./auth";

export const ADMIN_SESSION_COOKIE = "gtt_admin_session";

export async function readAdminSessionToken(): Promise<string | null> {
  return (await cookies()).get(ADMIN_SESSION_COOKIE)?.value ?? null;
}

export async function getCurrentAdminSession(): Promise<AdminSession | null> {
  const token = await readAdminSessionToken();
  return token ? getAdminAuthService().authenticate(token, false) : null;
}

export function setAdminSessionCookie(
  response: NextResponse,
  token: string,
  absoluteExpiresAt: number,
): void {
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    expires: new Date(absoluteExpiresAt),
  });
}

export function clearAdminSessionCookie(response: NextResponse): void {
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    expires: new Date(0),
  });
}

export async function getRequestIpAddress(): Promise<string> {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("x-real-ip") ??
    requestHeaders.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ??
    "unknown"
  );
}

export function hasValidSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
