#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-https://gtree.land}"; ENV=/etc/greentree/greentree.env
[ "$(id -u)" = 0 ] || { echo "Run production verification as root."; exit 1; }
[ -f "$ENV" ] && { set -a; . "$ENV"; set +a; }
nginx -t
sudo -u greentree -H pm2 jlist | node -e 'let x="";process.stdin.on("data",d=>x+=d).on("end",()=>{const p=JSON.parse(x).find(v=>v.name==="greentree");if(!p||p.pm2_env.status!=="online")process.exit(1)})'
curl -fsS http://127.0.0.1:3000/ >/dev/null
for route in / /news /contact /telegram /admin/login; do curl -fsS "$BASE$route" >/dev/null; done
meta=$(curl -fsS "$BASE/assets/token/metadata.json")
node -e 'const x=JSON.parse(process.argv[1]);if(x.image!=="https://gtree.land/assets/token/green-tree-token-logo.png")process.exit(1)' "$meta"
png=$(mktemp)
trap 'rm -f "$png"' EXIT
curl -fsS "$BASE/assets/token/green-tree-token-logo.png" -o "$png"
head -c 8 "$png" | cmp - <(printf '\211PNG\r\n\032\n')
sudo -u greentree -H test -w "$(dirname "${ADMIN_DB_PATH:-/var/lib/greentree/admin.db}")"
sudo -u greentree -H test -w /var/lib/greentree
! pgrep -fa 'getUpdates|telegram.*poll' >/dev/null
if [ "${TELEGRAM_BOT_ENABLED:-false}" = true ]; then
  : "${TELEGRAM_BOT_TOKEN:?}" "${TELEGRAM_WEBHOOK_URL:?}"
  status=$(curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo")
  node -e 'const x=JSON.parse(process.argv[1]);if(!x.ok||x.result.url!==process.argv[2])process.exit(1)' "$status" "$TELEGRAM_WEBHOOK_URL"
fi
echo "Production verification passed."
