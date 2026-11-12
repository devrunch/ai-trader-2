# Deploying ai-trader-2

Single entry point. Pick a path at the bottom: Docker (any compose host or PaaS) or bare-metal Linux with systemd.

## What the app needs

| Piece | Notes |
|---|---|
| API (`dist/main.js`, port 8000) | REST, `/api/socket.io`, agent, jobs. Heap 448 MB. Also holds the search index (~200 MB). Runs `dist/migrate.js` before start. |
| Market data (`dist/market-data.main.js`, port 8001) | The one Kite websocket. Heap 192 MB. |
| Web SPA | Static files; the proxy sends `/api/*` and `/health` to the API. |
| Postgres 18+ | The code uses `transaction_timeout` (Postgres 17+). |
| Redis | `maxmemory` 128 MB, policy `noeviction`. |
| Python compute (optional) | `COMPUTE_URL`. Backtests and the assistant's `runBacktest` need it. e.g. AWS Lambda: `deploy/aws-iam-setup.sh` once as an AWS admin, then `deploy/compute-lambda.sh`, which prints the URL (a Function URL signed with the `AWS_*` keys). A plain `http://` URL also works. |

Memory budget: api ~768 MB limit, market-data ~320 MB, web 64 MB, postgres ~512 MB, redis ~192 MB. About 2 GB in all.

The reverse proxy must allow websocket upgrade on `/api/socket.io` and set `TRUST_PROXY` to the number of proxy hops (default `loopback`; `1` for one proxy) so per-IP limits see real client addresses.

## Environment variables
Read from `apps/api/src/shared/config/app-config.ts`.

Required in production:

| Var | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgresql://...` |
| `REDIS_URL` | `redis://...` |
| `SESSION_SECRET` | 32+ chars |
| `ZERODHA_API_KEY`, `ZERODHA_API_SECRET`, `ZERODHA_USER_ID`, `ZERODHA_PASSWORD`, `ZERODHA_TOTP_SECRET` | The production config check fails without them |
| `APP_URL`, `CORS_ORIGINS` | The public origin, e.g. `https://app.example.com` (defaults are localhost) |

Optional (blank = off):

| Group | Vars |
|---|---|
| Server | `TRUST_PROXY`, `PORT` (8000), `MD_PORT` (8001), `DATABASE_POOL_MAX` (10), `LOG_LEVEL` (info) |
| Zerodha | `KITE_AUTO_LOGIN` (false), `KITE_REDIRECT_URL` |
| Email | `RESEND_API_KEY`, `RESEND_DOMAIN`, `ALERT_EMAIL_TO` (comma list), or `SMTP_URL` + `ALERT_EMAIL_FROM` |
| Assistant | `AGENT_MODEL`, `AGENT_FALLBACK_MODEL` (`provider/model`; unset disables it), `AGENT_BASE_URL`, `AGENT_API_KEY`, provider keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `BEDROCK_API_KEY`, `BEDROCK_BASE_URL`), `AGENT_MAX_ROUNDS`, `AGENT_TURN_TIMEOUT_MS`, `AGENT_MAX_TOKENS`, `AGENT_DAILY_TURNS` |
| AWS | `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` (Bedrock and signing the compute URL) |
| Compute | `COMPUTE_URL` |
| News | `NEWS_API_KEY` (public RSS feeds need no key) |

## Path A: Docker (any compose host or PaaS)
Files: `Dockerfile`, `docker-compose.coolify.yml` (api, market-data, web/nginx, postgres, redis), `deploy/nginx.conf` (already proxies `/api/*` with websocket upgrade).

- Worked example, Coolify: `docs/DEPLOY-COOLIFY.md` (setup, env vars, memory limits).
- Other hosts: run the compose file with the env vars above; publish only `web` (port 80) and put TLS in front. If another proxy sits in front of `web`, keep websocket upgrade on `/api/socket.io` and set `TRUST_PROXY` to the total hop count.

Create the admin (needs a TTY for the password):

    docker exec -it $(docker ps -qf name=api- | head -1) node dist/cli/create-admin.js <username>

## Path B: bare-metal Linux host with systemd
Ubuntu 24.04, arm64 (the setup script installs the arm64 Node build). Postgres 18, Redis, Caddy, Node and two systemd units (`deploy/systemd`) run on the host; Caddy serves the SPA and proxies the API.

Set once in your shell:

    export DEPLOY_HOST=ubuntu@<host-ip>      # ssh target
    export DEPLOY_KEY=~/.ssh/<key>.pem       # ssh private key
    export APP_DOMAIN=app.example.com        # public hostname, DNS pointing at the host

1. `scp -i "$DEPLOY_KEY" deploy/box-setup.sh "$DEPLOY_HOST:"`, then on the host `sudo bash box-setup.sh` (swap, Postgres 18, Redis, Node, Caddy, service user). It stops any old product's units; their code and data stay.
2. `deploy/push-env.sh` writes `/srv/aitrader2/shared/api.env` (mode 600) from `apps/api/.env` plus production values. Prints nothing secret. Rerun when a key changes.
3. `deploy/release.sh` from a clean `main`: builds locally, uploads, installs production dependencies on the host, migrates, switches the `current` symlink, checks `/health`, rolls back on failure. The last three releases are kept in `/srv/aitrader2/releases`. Every later release is this one command.
4. Create the admin (needs a TTY):

       ssh -t -i "$DEPLOY_KEY" "$DEPLOY_HOST" 'cd /srv/aitrader2/current/apps/api && sudo -u aitrader bash -c "set -a; . /srv/aitrader2/shared/api.env; node dist/cli/create-admin.js <username>"'

`deploy/clean-old-box.sh` (same env vars) removes a previous product's leftovers from the host; one-time and optional.
