# Deploying ai-trader-2

One EC2 box (Elastic IP 3.7.76.174, t4g.small arm64, Ubuntu 24.04), served at https://3.7.76.174.sslip.io.
Owner decision 2026-11-11: ai-trader-2 replaces the old product on this box; Postgres and Redis run on it; Python compute goes to Lambda (not wired yet: the API does not call compute).

| Piece | Where |
|---|---|
| Web (SPA) | static files from Caddy, `/srv/aitrader2/current/web` |
| API (REST, `/api/socket.io`, agent, jobs) | `aitrader2-api.service`, 127.0.0.1:8000, heap 448 MB |
| Market data (the one Kite websocket) | `aitrader2-market-data.service`, 127.0.0.1:8001, heap 256 MB |
| Postgres 16 | on the box, `aitrader` database, password in `/srv/aitrader2/shared/db.pass` |
| Redis | on the box, DB 1 (DB 0 holds the old product's keys), maxmemory 128 MB, noeviction |
| Secrets | `/srv/aitrader2/shared/api.env` (600, service user) |

## First time
1. `scp -i ~/.ssh/ai-trader-admin.pem deploy/box-setup.sh ubuntu@3.7.76.174:` then on the box `sudo bash box-setup.sh`. This **stops the old product** (its units are disabled, its code and data are kept; the old Caddyfile is saved as `/etc/caddy/Caddyfile.old-ai-trader`).
2. `deploy/push-env.sh`: sends the keys from `apps/api/.env` plus production values. Prints nothing secret.
3. `deploy/release.sh`: builds here, uploads, installs production dependencies on the box, migrates, switches, checks `/health`, rolls back if it fails.
4. Create the admin on the box (needs a terminal for the password):
   `ssh -t -i ~/.ssh/ai-trader-admin.pem ubuntu@3.7.76.174 'cd /srv/aitrader2/current/apps/api && sudo -u aitrader bash -c "set -a; . /srv/aitrader2/shared/api.env; node dist/cli/create-admin.js admin"'`

## Every release
`deploy/release.sh` from a clean `main`. The last three releases stay in `/srv/aitrader2/releases`.

## Bring the old product back
`sudo systemctl disable --now aitrader2-api aitrader2-market-data && sudo cp /etc/caddy/Caddyfile.old-ai-trader /etc/caddy/Caddyfile && sudo systemctl enable --now ai-trader-api ai-trader-frontend ai-trader-signals ai-trader-newsd && sudo systemctl reload caddy`
