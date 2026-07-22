#!/usr/bin/env bash
set -euo pipefail
exec 9>/var/lib/greentree/deploy.lock
flock -n 9 || { echo "Another deployment is active."; exit 1; }
APP=/var/www/greentree/app; DATA=/var/lib/greentree; ENV=/etc/greentree/greentree.env
[ -f "$ENV" ] || { echo "Missing environment file."; exit 1; }
[ -d "$APP/.git" ] || { echo "Clone repository first."; exit 1; }
mkdir -p "$APP/data" "$DATA/backups" "$DATA/public/assets/token"
cd "$APP"
git diff --quiet && git diff --cached --quiet || { echo "Dirty release checkout."; exit 1; }
previous=$(git rev-parse HEAD)
git fetch origin main
git checkout main
git merge --ff-only origin/main
test -s public/assets/token/green-tree-token-logo.png
node -e 'const x=require("./public/assets/token/metadata.json");if(x.image!=="https://gtree.land/assets/token/green-tree-token-logo.png")process.exit(1)'
backup="$DATA/backups/$(date +%Y%m%d%H%M%S)"; mkdir -p "$backup/token-assets"
cp -a "$DATA/public/assets/token/." "$backup/token-assets/" 2>/dev/null || true
stage=$(mktemp -d "$DATA/public/assets/token/.stage.XXXX")
cp public/assets/token/metadata.json public/assets/token/green-tree-token-logo.png "$stage/"
node -e 'const fs=require("fs");JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const b=fs.readFileSync(process.argv[2]);if(b.subarray(0,8).compare(Buffer.from([137,80,78,71,13,10,26,10])))process.exit(1)' "$stage/metadata.json" "$stage/green-tree-token-logo.png"
mv "$stage/metadata.json" "$DATA/public/assets/token/metadata.json"
mv "$stage/green-tree-token-logo.png" "$DATA/public/assets/token/green-tree-token-logo.png"
rmdir "$stage"
ln -sfn "$DATA/foundation-sale.db" "$APP/data/foundation-sale.db"
npm ci; npx tsc --noEmit; npm run test:foundation-quote; npm run build
set -a; . "$ENV"; set +a
pm2 startOrReload ecosystem.config.cjs --update-env; pm2 save
sleep 3
if ! curl -fsS http://127.0.0.1:3000/ >/dev/null; then
  git checkout "$previous"
  set -a; . "$ENV"; set +a
  pm2 startOrReload ecosystem.config.cjs --update-env
  exit 1
fi
"$APP/deploy/verify-production.sh"
find "$DATA/backups" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
