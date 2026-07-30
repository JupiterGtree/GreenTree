import { createHmac, randomUUID } from "node:crypto";
import { getAdminDatabase } from "@/lib/admin/database";
import { extractClientIp } from "./request-utils";
import { lookupCountry } from "./geoip";
export { extractClientIp, shouldTrack } from "./request-utils";

const text = (v: string | null | undefined, n: number) => { const x = v?.trim(); return x ? x.slice(0, n) : null; };
function classify(ua: string) {
  const bot = /bot|crawler|spider|slurp|facebookexternalhit|curl|wget|headless/i.test(ua);
  const browser = /Edg\//.test(ua)?"Edge":/Chrome\//.test(ua)?"Chrome":/Firefox\//.test(ua)?"Firefox":/Safari\//.test(ua)?"Safari":/MSIE|Trident/.test(ua)?"Internet Explorer":"Other";
  const os = /Windows/.test(ua)?"Windows":/Mac OS/.test(ua)?"macOS":/Android/.test(ua)?"Android":/iPhone|iPad|iOS/.test(ua)?"iOS":/Linux/.test(ua)?"Linux":"Other";
  const device = bot ? "bot" : /iPad|Tablet/.test(ua) ? "tablet" : /Mobile|Android|iPhone/.test(ua) ? "mobile" : "desktop";
  return { bot, browser, os, device };
}
export function recordPageView(input: { pathname: string; hostname?: string; method: string; headers: Headers; status?: number; directIp?: string | null; sessionId?: string | null }) {
  try {
    if (process.env.ANALYTICS_ENABLED === "false" || process.env.ANALYTICS_RESPECT_DNT !== "false" && input.headers.get("dnt") === "1") return;
    const ua = text(input.headers.get("user-agent"), 512) ?? ""; const c = classify(ua); const ip = extractClientIp(input.headers, input.directIp);
    const secret = process.env.ANALYTICS_HASH_SECRET || process.env.ADMIN_SESSION_SECRET || "development-only";
    const day = new Date().toISOString().slice(0,10); const visitor = createHmac("sha256", secret).update(`${ip.ip ?? "unknown"}:${day}`).digest("hex");
    const url = new URL(input.headers.get("x-forwarded-proto") && input.headers.get("host") ? `${input.headers.get("x-forwarded-proto")}://${input.headers.get("host")}${input.pathname}` : `http://local${input.pathname}`);
    const ref = text(input.headers.get("referer"), 1000); const db=getAdminDatabase(); const now=Date.now();
    const localCountry = lookupCountry(ip.ip);
    const geo = { countryCode:text(input.headers.get("x-geo-country"),8) ?? localCountry.countryCode, country:text(input.headers.get("x-geo-country-name"),100) ?? localCountry.countryName, region:text(input.headers.get("x-geo-region"),100), city:text(input.headers.get("x-geo-city"),100), timezone:text(input.headers.get("x-geo-timezone"),80) };
    db.db.prepare(`INSERT INTO analytics_page_views (id,occurred_at,pathname,hostname,method,referrer,referrer_domain,utm_source,utm_medium,utm_campaign,utm_term,utm_content,user_agent,browser,operating_system,device_type,ip_address,ip_source,visitor_hash,country_code,country_name,region,city,timezone,is_bot,session_id,response_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      randomUUID(), now, text(input.pathname,300)!, text(input.hostname,255), input.method, ref, ref ? new URL(ref).hostname : null,
      ...["utm_source","utm_medium","utm_campaign","utm_term","utm_content"].map((k)=>text(url.searchParams.get(k),200)), ua, c.browser, c.os, c.device,
      process.env.ANALYTICS_STORE_RAW_IP === "false" ? null : ip.ip, ip.source, visitor, geo.countryCode, geo.country, geo.region, geo.city, geo.timezone, c.bot?1:0, text(input.sessionId,120), input.status ?? 200);
    const retention=Number(process.env.ANALYTICS_EVENT_RETENTION_DAYS||365); db.db.prepare("DELETE FROM analytics_page_views WHERE occurred_at < ?").run(now-retention*86400000);
    if (process.env.ANALYTICS_STORE_RAW_IP !== "false") {
      const ipRetention=Number(process.env.ANALYTICS_IP_RETENTION_DAYS||30);
      db.db.prepare("UPDATE analytics_page_views SET ip_address = NULL WHERE occurred_at < ? AND ip_address IS NOT NULL").run(now-ipRetention*86400000);
    }
  } catch { /* analytics must never affect the page response */ }
}
export function overview(from: number, to: number, includeBots=false) {
  const db=getAdminDatabase().db; const bot=includeBots?"":" AND is_bot=0"; const args=[from,to];
  const s=db.prepare(`SELECT COUNT(*) pageViews, COUNT(DISTINCT visitor_hash) uniqueVisitors, COUNT(DISTINCT session_id) sessions, COUNT(DISTINCT country_code) countries, SUM(CASE WHEN is_bot=1 THEN 1 ELSE 0 END) bots FROM analytics_page_views WHERE occurred_at BETWEEN ? AND ?${bot}`).get(...args) as Record<string,number>;
  const series=db.prepare(`SELECT substr(datetime(occurred_at/1000,'unixepoch'),1,10) day, COUNT(*) pageViews, COUNT(DISTINCT visitor_hash) uniqueVisitors, COUNT(DISTINCT session_id) sessions FROM analytics_page_views WHERE occurred_at BETWEEN ? AND ?${bot} GROUP BY day ORDER BY day`).all(...args);
  const pages=db.prepare(`SELECT pathname,COUNT(*) count FROM analytics_page_views WHERE occurred_at BETWEEN ? AND ?${bot} GROUP BY pathname ORDER BY count DESC LIMIT 20`).all(...args);
  return { summary:s, series, pages };
}
export function listViews(from:number,to:number,page=1,pageSize=50){ const db=getAdminDatabase().db; const offset=(page-1)*Math.min(pageSize,100); return db.prepare("SELECT occurred_at,ip_address,country_code,country_name,region,city,pathname,referrer,browser,operating_system,device_type,utm_source,utm_campaign,is_bot,session_id FROM analytics_page_views WHERE occurred_at BETWEEN ? AND ? ORDER BY occurred_at DESC LIMIT ? OFFSET ?").all(from,to,Math.min(pageSize,100),offset); }
