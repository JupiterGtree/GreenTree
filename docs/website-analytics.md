# Website Analytics

Green Tree analytics is first-party and server-side. Public HTML page views are recorded by the application middleware in SQLite; no browser analytics script or third-party service is used. Admin, API, framework assets, static files, health checks and bots are excluded from human metrics by default.

## Privacy

Visitor identifiers are daily HMAC-SHA256 values derived from the server-only `ANALYTICS_HASH_SECRET`; wallet addresses and request bodies are never used. `DNT: 1` is respected when enabled. Raw IP storage is disabled by default and is masked in the admin UI. Approximate geography is optional and requires a local GeoLite2 City database configured with `GEOIP_DATABASE_PATH`; the application never sends IPs to an external geolocation API.

## Configuration

`ANALYTICS_ENABLED`, `ANALYTICS_STORE_RAW_IP`, `ANALYTICS_IP_RETENTION_DAYS`, `ANALYTICS_EVENT_RETENTION_DAYS`, `ANALYTICS_HASH_SECRET`, `ANALYTICS_RESPECT_DNT`, and optional `GEOIP_DATABASE_PATH` are server-only settings. Keep the HMAC secret out of Git and browser bundles. Set `ANALYTICS_ENABLED=false` for an immediate tracking shutdown.

The tables `analytics_page_views` and `analytics_geo_cache` are created idempotently by the existing admin SQLite initialization. Retention cleanup runs during tracking and is safe to repeat.

## Proxy and access

The controlled Nginx proxy should send `X-Real-IP`, `X-Forwarded-For`, and `Host`. The application validates and records the source used. Analytics APIs require an authenticated admin session and `analytics.view`. Raw IP export/search is OWNER-only via `analytics.ip.view` and is audit logged.

## Deployment and rollback

Deploy with the normal Green Tree deployment flow so the migration runs when the application initializes. Verify `/admin/analytics`, then reload the existing PM2 process. To roll back, use the standard deployment rollback procedure; the analytics tables are additive and do not alter purchase, wallet, treasury or distribution tables.
