#!/usr/bin/env bash
set -euo pipefail
set -a; . /etc/greentree/greentree.env; set +a
: "${TELEGRAM_BOT_TOKEN:?}" "${TELEGRAM_WEBHOOK_SECRET:?}" "${TELEGRAM_WEBHOOK_URL:?}" "${TELEGRAM_MINI_APP_URL:?}"
api="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"
curl -fsS -X POST "$api/setWebhook" -d "url=$TELEGRAM_WEBHOOK_URL" -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" -d 'allowed_updates=["message","callback_query"]' >/dev/null
curl -fsS -X POST "$api/setMyCommands" --data-urlencode 'commands=[{"command":"start","description":"Open Green Tree"},{"command":"buy","description":"Buy GTREE"},{"command":"price","description":"Live price"},{"command":"activity","description":"Recent activity"},{"command":"support","description":"Contact support"},{"command":"status","description":"Service status"},{"command":"help","description":"Help"},{"command":"cancel","description":"Cancel"}]' >/dev/null
menu=$(printf '{"type":"web_app","text":"Open Green Tree","web_app":{"url":"%s"}}' "$TELEGRAM_MINI_APP_URL")
curl -fsS -X POST "$api/setChatMenuButton" --data-urlencode "menu_button=$menu" >/dev/null
status=$(curl -fsS "$api/getWebhookInfo")
node -e 'const x=JSON.parse(process.argv[1]);if(!x.ok||x.result.url!==process.argv[2])process.exit(1);console.log(JSON.stringify({url:x.result.url,pending_update_count:x.result.pending_update_count,last_error_date:x.result.last_error_date??null}))' "$status" "$TELEGRAM_WEBHOOK_URL"
