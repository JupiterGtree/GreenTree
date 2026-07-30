declare module "geoip-lite" {
  export interface GeoLookup {
    country?: string;
    region?: string;
    city?: string;
    timezone?: string;
  }
  export function lookup(ip: string): GeoLookup | null;
}
