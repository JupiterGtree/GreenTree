import type { AdminLoginResult } from "./auth";

export interface PublicAdminLoginResponse {
  status: 200 | 401 | 429;
  body: { ok: true } | { error: string };
  headers?: { "Retry-After": string };
}

export function toPublicAdminLoginResponse(result: AdminLoginResult): PublicAdminLoginResponse {
  if (result.ok) return { status: 200, body: { ok: true } };
  if (result.reason === "RATE_LIMITED" || result.reason === "LOCKED") {
    return {
      status: 429,
      body: { error: "Too many attempts. Try again later." },
      headers: { "Retry-After": "900" },
    };
  }
  return { status: 401, body: { error: "Invalid credentials." } };
}
