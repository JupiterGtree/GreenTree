export function extractClientIp(headers: Headers, direct?: string | null): { ip: string | null; source: string } {
  const valid = (v: string | null) => { if (!v) return null; const x=v.trim().replace(/^::ffff:/i, ""); return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(x) || /^[0-9a-f:]+$/i.test(x) ? x : null; };
  const trusted = headers.get("x-real-ip")?.trim() ?? null; if (valid(trusted)) return { ip: valid(trusted)!, source: "x-real-ip" };
  const forwarded = headers.get("x-forwarded-for")?.split(",").map((x) => valid(x)).find(Boolean); if (forwarded) return { ip: forwarded, source: "x-forwarded-for" };
  const socket = valid(direct ?? null); return { ip: socket, source: socket ? "socket" : "none" };
}
export function shouldTrack(pathname: string, method: string, type?: string | null) { return method === "GET" && !pathname.startsWith("/admin") && !pathname.startsWith("/api/") && !/^\/(?:_next|favicon|robots\.txt|sitemap|.*\.(?:js|css|png|jpg|jpeg|svg|webp|ico|map|woff2?|ttf|xml|txt))$/i.test(pathname) && (!type || type.includes("text/html")); }
