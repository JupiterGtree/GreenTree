#!/usr/bin/env bash
set -euo pipefail; exec 9>/var/lib/greentree/deploy.lock; flock -n 9 || exit 1
APP=/var/www/greentree/app; DATA=/var/lib/greentree; ENV=/etc/greentree/greentree.env; [ -f "$ENV" ] || { echo "Missing env file"; exit 1; }; [ -d "$APP/.git" ] || { echo "Clone repository first"; exit 1; }
cd "$APP"; git diff --quiet && git diff --cached --quiet || { echo "Dirty release checkout"; exit 1; }; previous=$(git rev-parse HEAD); git fetch origin main; git checkout main; git reset --ff-only origin/main
test -s public/assets/token/green-tree-token-logo.png; node -e 'const x=require("./public/assets/token/metadata.json");if(x.image!=="https://gtree.land/assets/token/green-tree-token-logo.png")process.exit(1)'
mkdir -p "$DATA/backups/$(date +%Y%m%d%H%M%S)"; backup=$(ls -dt "$DATA/backups"/* | head -1); cp -a "$DATA/public/assets/token/." "$backup/" 2>/dev/null || true
tmp=$(mktemp -d "$DATA/public/assets/token/.stage.XXXX"); cp public/assets/token/metadata.json public/assets/token/green-tree-token-logo.png "$tmp/"; mv "$tmp/metadata.json" "$DATA/public/assets/token/metadata.json"; mv "$tmp/green-tree-token-logo.png" "$DATA/public/assets/token/green-tree-token-logo.png"; rmdir "$tmp"
ln -sfn "$DATA/foundation-sale.db" "$APP/data/foundation-sale.db"; npm ci; npx tsc --noEmit; npm run test:foundation-quote; npm run build
set -a; . "$ENV"; set +a; pm2 startOrReload ecosystem.config.cjs --update-env; pm2 save; sleep 3; curl -fsS http://127.0.0.1:3000/ >/dev/null || { git reset --hard "$previous"; pm2 startOrReload ecosystem.config.cjs --update-env; exit 1; }
"$APP/deploy/verify-production.sh"; find "$DATA/backups" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
