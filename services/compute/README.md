# Compute service

Stateless FastAPI service (SRD §10.2): request in, result out. No database, no outbound calls, no credentials, never calls Node. Node owns all state and business rules.

## Endpoints
- `GET /health` → `{ "status": "ok" }`
- `POST /compute/v1/backtest` → trades, close-marked equity curve, metrics, optional in/out-of-sample blocks. Fill rules and metric definitions: `docs/superpowers/plans/2026-11-09-phase-6-compute.md`.

Errors use the API's shape `{ code, message, details?, requestId }`. `x-request-id` is accepted or generated, echoed, and logged.

## Limits
Body ≤ 32 MiB (413), ≤ 100 000 bars, ≤ 32 series, condition tree ≤ 64 nodes and depth ≤ 8, 10 s per backtest (504 `UNAVAILABLE`).

## Run
Needs [uv](https://docs.astral.sh/uv/) and Python 3.13 (`uv` picks it from `.python-version`).

```sh
cd services/compute
uv sync --frozen
uv run python -m compute --host 127.0.0.1 --port 8100   # JSON logs on stderr
```

## Check
From the repo root:

```sh
pnpm check:python          # ruff check, ruff format --check, mypy --strict, pytest
pnpm check:compute-client  # fails if packages/compute-client differs from a fresh generation
pnpm generate:compute-client  # after any change to the API models
```

Both run inside `pnpm check:code`.

## Dependencies
Exact pins in `pyproject.toml`, locked in `uv.lock`. `[tool.uv] exclude-newer` keeps resolution to releases at least 14 days old; move it forward when upgrading.
