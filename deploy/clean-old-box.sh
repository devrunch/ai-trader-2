#!/usr/bin/env bash
# One-time: removes the old ai-trader product and leftovers from the EC2 box. ai-trader-2 keeps running.
# Removes: ~/ai-trader (code is on GitHub; .env backed up to D:\adizx\ai-trader\deploy\box-backup-2026-11-11),
# the old systemd units, Docker leftovers, Node 20 (ai-trader-2 uses /opt/node), the stopped Postgres 16 cluster,
# the old product's Redis DB 0, caches and old journals. Keeps snapd (the SSM agent runs as a snap).
#   bash deploy/clean-old-box.sh
set -euo pipefail
HOST=${DEPLOY_HOST:-ubuntu@3.7.76.174}
KEY=${DEPLOY_KEY:-$HOME/.ssh/ai-trader-admin.pem}

ssh -i "$KEY" -o ConnectTimeout=15 "$HOST" 'sudo bash -s' <<'REMOTE'
set -uo pipefail
export DEBIAN_FRONTEND=noninteractive
echo "== before =="; df -h / | tail -1; free -m | sed -n 2p

echo "== old units =="
for u in ai-trader-api ai-trader-frontend ai-trader-signals ai-trader-newsd; do
  systemctl disable --now "$u" 2>/dev/null || true
  rm -f "/etc/systemd/system/$u.service"
  rm -rf "/etc/systemd/system/$u.service.d"
done
systemctl daemon-reload; systemctl reset-failed

echo "== old code, caches =="
rm -rf /home/ubuntu/ai-trader /home/ubuntu/.npm /home/ubuntu/.cache /home/ubuntu/.docker /home/ubuntu/READY
rm -rf /root/.npm /root/.cache
rm -f /etc/caddy/Caddyfile.old-ai-trader

echo "== old Redis data (DB 0; ai-trader-2 uses DB 1) =="
redis-cli -n 0 flushdb

echo "== Postgres 16 cluster (stopped; data was upgraded to 18) =="
if pg_lsclusters | grep -q '^16 '; then pg_dropcluster --stop 16 main; fi
apt-get purge -y -qq 'postgresql-16*' >/dev/null 2>&1 || true

echo "== Docker leftovers and Node 20 =="
apt-get purge -y -qq docker-ce-rootless-extras docker-model-plugin nodejs >/dev/null 2>&1 || true
rm -f /etc/apt/sources.list.d/docker*.list /etc/apt/sources.list.d/nodesource*.list
rm -f /etc/apt/keyrings/docker* /etc/apt/keyrings/nodesource* /usr/share/keyrings/nodesource*
apt-get update -qq
apt-get autoremove --purge -y -qq >/dev/null 2>&1 || true
apt-get clean
journalctl --vacuum-size=100M >/dev/null 2>&1 || true

echo "== after =="; df -h / | tail -1; free -m | sed -n 2p
echo "node: $(node -v)  docker: $(command -v docker || echo none)"
systemctl is-active aitrader2-api aitrader2-market-data postgresql@18-main redis-server caddy | paste -sd' '
curl -fsS -m 5 http://127.0.0.1:8000/health && echo
REMOTE
