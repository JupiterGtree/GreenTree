#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run as root."; exit 1; }
. /etc/os-release; [ "${ID:-}" = ubuntu ] || { echo "Ubuntu required."; exit 1; }
apt-get update; apt-get install -y curl git nginx certbot python3-certbot-nginx build-essential ca-certificates
id greentree >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/www/greentree --shell /usr/sbin/nologin greentree
install -d -o greentree -g greentree -m 0750 /var/www/greentree /var/lib/greentree /var/lib/greentree/backups /var/log/greentree
install -d -o greentree -g greentree -m 0755 /var/lib/greentree/public /var/lib/greentree/public/assets /var/lib/greentree/public/assets/token
# Nginx needs traversal only through the private data root and read access to
# the two intentionally public token assets served from the nested directory.
chmod 0751 /var/lib/greentree
install -d -o root -g greentree -m 0750 /etc/greentree /etc/greentree/secrets
[ -f /etc/greentree/greentree.env ] || install -o root -g greentree -m 0640 deploy/greentree.env.example /etc/greentree/greentree.env
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -; apt-get install -y nodejs; npm install -g pm2
pm2 startup systemd -u greentree --hp /var/www/greentree
unit=$(systemctl list-unit-files 'pm2-greentree.service' --no-legend | awk '{print $1}')
[ "$unit" = "pm2-greentree.service" ] && systemctl is-enabled --quiet pm2-greentree.service || { echo "PM2 systemd unit was not enabled."; exit 1; }
echo "Complete DNS, Nginx and Certbot before production deployment."
