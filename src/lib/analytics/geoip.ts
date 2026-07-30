import "server-only";
import { lookup } from "geoip-lite";

type CountryResult = { countryCode: string | null; countryName: string | null };
const cache = new Map<string, { expiresAt: number; result: CountryResult }>();
const TTL_MS = 24 * 60 * 60 * 1000;
const names = new Intl.DisplayNames(["en"], { type: "region" });

export function lookupCountry(ip: string | null): CountryResult {
  if (!ip) return { countryCode: null, countryName: null };
  const cached = cache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  let result: CountryResult = { countryCode: null, countryName: null };
  try {
    const record = lookup(ip);
    const code = record?.country?.toUpperCase() || null;
    result = { countryCode: code, countryName: code ? (names.of(code) ?? code) : null };
  } catch {
    // GeoIP is best-effort and must never affect page delivery.
  }
  cache.set(ip, { expiresAt: Date.now() + TTL_MS, result });
  return result;
}
