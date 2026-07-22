#!/usr/bin/env bash
set -euo pipefail
APP=/var/www/greentree/app; ENV=/etc/greentree/greentree.env; DATA=/var/lib/greentree
[ "$(id -un)" = "greentree" ] || { echo "Run this rollback script as the greentree user."; exit 1; }
target="${1:?commit required}"; asset_backup="${2:-}"
[ -f "$ENV" ] || { echo "Missing environment file."; exit 1; }
cd "$APP"; git checkout "$target"; npm ci; npm run build
if [ -n "$asset_backup" ]; then
  source="$DATA/backups/$asset_backup/token-assets"
  [ -s "$source/metadata.json" ] && [ -s "$source/green-tree-token-logo.png" ] || { echo "Valid token-asset backup not found."; exit 1; }
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$source/metadata.json"
  stage=$(mktemp -d "$DATA/public/assets/token/.restore.XXXX"); cp "$source/metadata.json" "$source/green-tree-token-logo.png" "$stage/"; mv "$stage/metadata.json" "$DATA/public/assets/token/metadata.json"; mv "$stage/green-tree-token-logo.png" "$DATA/public/assets/token/green-tree-token-logo.png"; rmdir "$stage"
fi
set -a; . "$ENV"; set +a
pm2 startOrReload ecosystem.config.cjs --update-env
echo "Code rollback complete. Databases were intentionally untouched."
