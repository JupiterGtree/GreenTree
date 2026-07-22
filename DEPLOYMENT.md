# Green Tree production deployment

On Ubuntu, clone this repository to `/var/www/greentree/app`, run `sudo bash deploy/setup-vps.sh`, copy `deploy/greentree.env.example` to `/etc/greentree/greentree.env` and provide production values there with mode `0640 root:greentree`. Do not copy `.env.local` wholesale: transfer each production value only after review. Configure DNS, run Certbot for `gtree.land www.gtree.land`, install `deploy/nginx/gtree.land.conf`, then run `sudo -u greentree bash deploy/deploy.sh`. Finally run `sudo -u greentree bash deploy/configure-telegram.sh` only after HTTPS and Telegram secrets are valid. The deployment keeps SQLite databases and permanent token assets outside releases; rollback never rolls databases back.

`/etc/greentree/greentree.env` is sourced by Bash during deployment, rollback, verification, PM2 reload, and Telegram setup. Values containing `$`, spaces, `#`, or other shell-special characters must use single quotes. For example:

```bash
ADMIN_PASSWORD_HASH='$scrypt$example'
ADMIN_SESSION_SECRET='replace-with-production-secret'
ADMIN_IP_HMAC_SECRET='replace-with-production-secret'
```

Validate the environment in a clean Bash process without printing values:

```bash
bash -c 'set -a; source /etc/greentree/greentree.env; set +a; test -n "$ADMIN_PASSWORD_HASH"'
```

Verify required names without exposing contents:

```bash
bash -c 'set -a; source /etc/greentree/greentree.env; set +a; for n in ADMIN_PASSWORD_HASH ADMIN_SESSION_SECRET ADMIN_IP_HMAC_SECRET SOLANA_RPC_URL FOUNDATION_DIRECT_SALE_SIGNER_KEYPAIR_PATH; do test -n "${!n}" || { echo "Missing $n"; exit 1; }; done'
```
