#!/usr/bin/env bash
set -euo pipefail; APP=/var/www/greentree/app; cd "$APP"; target="${1:?commit required}"; git checkout "$target"; npm ci; npm run build; pm2 startOrReload ecosystem.config.cjs --update-env; echo "Code rolled back. Databases are intentionally untouched."
