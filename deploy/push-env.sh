#!/usr/bin/env bash
# Sends the API's secrets to the host (DEPLOY_HOST, DEPLOY_KEY, APP_DOMAIN) as /srv/aitrader2/shared/api.env: the keys from apps/api/.env plus production values.
# Nothing is printed; the file is mode 600, owned by the service user. Run after box-setup.sh and whenever a key changes.
set -euo pipefail
HOST=${DEPLOY_HOST:?set DEPLOY_HOST, e.g. ubuntu@host}
KEY=${DEPLOY_KEY:?set DEPLOY_KEY to the ssh private key path}
URL=https://${APP_DOMAIN:?set APP_DOMAIN, the public hostname}
cd "$(git rev-parse --show-toplevel)"
SRC=apps/api/.env
[ -f "$SRC" ] || { echo "no $SRC" >&2; exit 1; }

# Local-only keys are dropped; the box supplies its own database, Redis, session secret and URLs.
grep -vE '^(NODE_ENV|DATABASE_URL|REDIS_URL|SESSION_SECRET|APP_URL|CORS_ORIGINS|PORT|MD_PORT|LOG_LEVEL)=' "$SRC" \
  | ssh -i "$KEY" -o ConnectTimeout=15 "$HOST" "sudo bash -c '
set -euo pipefail
ROOT=/srv/aitrader2/shared
umask 077
cat > \$ROOT/api.env.new
[ -f \$ROOT/session.secret ] || openssl rand -hex 32 > \$ROOT/session.secret
{
  echo NODE_ENV=production
  echo KITE_AUTO_LOGIN=true
  echo LOG_LEVEL=info
  echo DATABASE_URL=postgresql://aitrader:\$(cat \$ROOT/db.pass)@127.0.0.1:5432/aitrader
  echo DATABASE_POOL_MAX=10
  echo REDIS_URL=redis://127.0.0.1:6379/1
  echo SESSION_SECRET=\$(cat \$ROOT/session.secret)
  echo APP_URL=$URL
  echo CORS_ORIGINS=$URL
} >> \$ROOT/api.env.new
mv \$ROOT/api.env.new \$ROOT/api.env
chown aitrader:aitrader \$ROOT/api.env \$ROOT/session.secret \$ROOT/db.pass
chmod 600 \$ROOT/api.env
echo env written: \$(grep -c = \$ROOT/api.env) keys
'"
