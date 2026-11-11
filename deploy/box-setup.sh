#!/usr/bin/env bash
# One-time (idempotent) setup of the EC2 box for ai-trader-2. Run on the box as ubuntu:
#   sudo bash box-setup.sh
# Owner decision 2026-11-11: ai-trader-2 replaces the old product on this t4g.small (arm64, 1.8 GB). The old units are
# stopped and disabled, never deleted: their code stays in ~/ai-trader and their data in MongoDB Atlas.
set -euo pipefail
NODE_VERSION=26.13.0
ROOT=/srv/aitrader2
[ "$(id -u)" = 0 ] || { echo "run with sudo" >&2; exit 1; }

echo "== swap (2 GB) =="
if [ "$(swapon --show --noheadings | wc -l)" = 0 ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -q vm.swappiness=10 && echo 'vm.swappiness=10' > /etc/sysctl.d/90-aitrader2.conf

echo "== packages =="
apt-get update -qq
apt-get install -y -qq postgresql postgresql-contrib curl xz-utils >/dev/null

echo "== postgres, sized for a 1.8 GB box =="
PGCONF=$(ls -d /etc/postgresql/*/main | tail -1)/conf.d
mkdir -p "$PGCONF"
cat > "$PGCONF/aitrader2.conf" <<'CONF'
listen_addresses = 'localhost'
max_connections = 40
shared_buffers = 128MB
effective_cache_size = 512MB
work_mem = 4MB
maintenance_work_mem = 64MB
wal_buffers = 4MB
random_page_cost = 1.1
CONF
systemctl restart postgresql
mkdir -p "$ROOT/shared"
if [ ! -f "$ROOT/shared/db.pass" ]; then
  openssl rand -hex 24 > "$ROOT/shared/db.pass"; chmod 600 "$ROOT/shared/db.pass"
fi
PASS=$(cat "$ROOT/shared/db.pass")
sudo -u postgres psql -qtc "SELECT 1 FROM pg_roles WHERE rolname='aitrader'" | grep -q 1 \
  || sudo -u postgres psql -qc "CREATE ROLE aitrader LOGIN PASSWORD '$PASS'"
sudo -u postgres psql -qc "ALTER ROLE aitrader PASSWORD '$PASS'"
sudo -u postgres psql -qtc "SELECT 1 FROM pg_database WHERE datname='aitrader'" | grep -q 1 \
  || sudo -u postgres createdb -O aitrader aitrader

echo "== redis: keep noeviction (BullMQ needs it), cap memory =="
redis-cli config set maxmemory 128mb >/dev/null
grep -q '^maxmemory 128mb' /etc/redis/redis.conf || echo 'maxmemory 128mb' >> /etc/redis/redis.conf

echo "== node $NODE_VERSION (arm64) and pnpm =="
if [ "$(/opt/node/bin/node -v 2>/dev/null)" != "v$NODE_VERSION" ]; then
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-arm64.tar.xz" -o /tmp/node.tar.xz
  rm -rf /opt/node && mkdir -p /opt/node && tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1 && rm /tmp/node.tar.xz
fi
ln -sf /opt/node/bin/node /usr/local/bin/node
/opt/node/bin/npm install -g --silent pnpm@10.34.9 >/dev/null
ln -sf /opt/node/bin/pnpm /usr/local/bin/pnpm

echo "== service user and layout =="
id aitrader >/dev/null 2>&1 || useradd --system --home "$ROOT" --shell /usr/sbin/nologin aitrader
mkdir -p "$ROOT/releases" "$ROOT/shared"
chown -R aitrader:aitrader "$ROOT"
chmod 750 "$ROOT/shared"

echo "== stop the old product (kept on disk) =="
for unit in ai-trader-api ai-trader-frontend ai-trader-signals ai-trader-newsd; do
  systemctl disable --now "$unit" 2>/dev/null || true
done
[ -f /etc/caddy/Caddyfile.old-ai-trader ] || cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.old-ai-trader

echo "box ready"
