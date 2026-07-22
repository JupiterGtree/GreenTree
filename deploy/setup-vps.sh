#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run as root"; exit 1; }; . /etc/os-release; [ "${ID:-}" = ubuntu ] || { echo "Ubuntu required"; exit 1; }
apt-get update; apt-get install -y curl git nginx certbot python3-certbot-nginx build-essential ca-certificates
if ! id greentree >/dev/null 2>&1; then useradd --system --create-home --home-dir /var/www/greentree --shell /usr/sbin/nologin greentree; fi
install -d -o greentree -g greentree -m 0750 /var/www/greentree /var/lib/greentree/backups /var/lib/greentree/public/assets/token /var/log/greentree
install -d -o root -g greentree -m 0750 /etc/greentree/secrets
[ -f /etc/greentree/greentree.env ] || install -o root -g greentree -m 0640 deploy/greentree.env.example /etc/greentree/greentree.env
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -; apt-get install -y nodejs; npm install -g pm2
sudo -u greentree pm2 startup systemd -u greentree --hp /var/www/greentree || true
echo "Complete DNS + Certbot before production deploy."
