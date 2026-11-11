#!/usr/bin/env bash
# Build on this machine, ship to the EC2 box, migrate, switch, health-check, roll back on failure.
#   deploy/release.sh              # deploys main's HEAD
# Nothing is built on the box (1.8 GB): it only installs production dependencies, which pulls the arm64 builds.
set -euo pipefail
HOST=${DEPLOY_HOST:-ubuntu@3.7.76.174}
KEY=${DEPLOY_KEY:-$HOME/.ssh/ai-trader-admin.pem}
ROOT=/srv/aitrader2
cd "$(git rev-parse --show-toplevel)"
source scripts/lib/node-env.sh

[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "commit or stash first" >&2; exit 1; }
SHA=$(git rev-parse --short HEAD)
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

echo "== build $SHA =="
pnpm build:packages >/dev/null
pnpm --filter @aitrader/api build >/dev/null
pnpm --filter @aitrader/web build >/dev/null

echo "== stage =="
cp package.json pnpm-lock.yaml pnpm-workspace.yaml "$STAGE/"
# pnpm applies patchedDependencies (PineTS) at install, so the patches travel with the release.
if [ -d patches ]; then cp -r patches "$STAGE/"; fi
for dir in apps/api apps/web packages/contracts packages/resilience packages/compute-client; do
  mkdir -p "$STAGE/$dir" && cp "$dir/package.json" "$STAGE/$dir/"
done
cp -r apps/api/dist apps/api/drizzle "$STAGE/apps/api/"
for p in contracts resilience compute-client; do cp -r "packages/$p/dist" "$STAGE/packages/$p/"; done
cp -r apps/web/dist "$STAGE/web"
echo "$SHA" > "$STAGE/REVISION"
tar -czf "$STAGE.tgz" -C "$STAGE" .

ssh_box() { ssh -i "$KEY" -o ConnectTimeout=15 "$HOST" "$@"; }
echo "== upload =="
scp -q -i "$KEY" "$STAGE.tgz" "$HOST:/tmp/aitrader2-$SHA.tgz"
scp -q -i "$KEY" deploy/Caddyfile deploy/systemd/*.service "$HOST:/tmp/"
rm -f "$STAGE.tgz"

echo "== install, migrate, switch =="
ssh_box "sudo bash -s" "$SHA" "$ROOT" <<'REMOTE'
set -euo pipefail
SHA=$1; ROOT=$2; REL=$ROOT/releases/$SHA
PREV=$(readlink -f "$ROOT/current" 2>/dev/null || true)
rm -rf "$REL" && mkdir -p "$REL" && tar -xzf "/tmp/aitrader2-$SHA.tgz" -C "$REL" && rm "/tmp/aitrader2-$SHA.tgz"
chown -R aitrader:aitrader "$REL"
sudo -u aitrader -H bash -c "cd '$REL' && CI=1 pnpm install --prod --frozen-lockfile --filter @aitrader/api... --config.confirmModulesPurge=false >/dev/null"
set -a; . "$ROOT/shared/api.env"; set +a
sudo -u aitrader --preserve-env=DATABASE_URL /opt/node/bin/node "$REL/apps/api/dist/migrate.js"

install -m 644 /tmp/aitrader2-api.service /tmp/aitrader2-market-data.service /etc/systemd/system/
install -m 644 /tmp/Caddyfile /etc/caddy/Caddyfile
rm -f /tmp/aitrader2-*.service /tmp/Caddyfile
systemctl daemon-reload
ln -sfn "$REL" "$ROOT/current"
systemctl enable -q aitrader2-api aitrader2-market-data
systemctl restart aitrader2-market-data aitrader2-api
systemctl reload caddy || systemctl restart caddy

ok=0
for _ in $(seq 1 30); do
  if curl -fsS -m 3 http://127.0.0.1:8000/health >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
if [ "$ok" != 1 ]; then
  echo "API did not become healthy; last log lines:" >&2
  journalctl -u aitrader2-api -n 30 --no-pager >&2 || true
  if [ -n "$PREV" ] && [ "$PREV" != "$REL" ]; then
    ln -sfn "$PREV" "$ROOT/current"; systemctl restart aitrader2-market-data aitrader2-api
    echo "rolled back to $(basename "$PREV")" >&2
  fi
  exit 1
fi
# Keep the last three releases.
ls -1dt "$ROOT"/releases/* | tail -n +4 | xargs -r rm -rf
echo "live: $SHA"
REMOTE
echo "== https check =="
curl -fsS -m 10 "https://3.7.76.174.sslip.io/health" && echo
