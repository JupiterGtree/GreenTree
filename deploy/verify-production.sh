#!/usr/bin/env bash
set -euo pipefail
base="${1:-https://gtree.land}"; curl -fsS "$base/" >/dev/null; curl -fsS "$base/news" >/dev/null; curl -fsS "$base/contact" >/dev/null; curl -fsS "$base/telegram" >/dev/null; curl -fsS "$base/admin/login" >/dev/null
meta=$(curl -fsS "$base/assets/token/metadata.json"); node -e 'JSON.parse(process.argv[1]); if(JSON.parse(process.argv[1]).image!=="https://gtree.land/assets/token/green-tree-token-logo.png") process.exit(1)' "$meta"
curl -fsS "$base/assets/token/green-tree-token-logo.png" | head -c 8 | cmp - <(printf '\211PNG\r\n\032\n')
echo "Production HTTP and permanent token-asset checks passed."
