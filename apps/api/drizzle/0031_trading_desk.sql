-- Trading desk: a task may run the desk instead of a single assistant turn; every desk run and desk backtest is stored with its trail.
ALTER TABLE agent_tasks ADD COLUMN desk jsonb;
CREATE TABLE desk_runs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  as_of timestamptz NOT NULL,
  live boolean NOT NULL,
  created_at timestamptz NOT NULL,
  status text NOT NULL,
  decision jsonb NOT NULL,
  trail jsonb NOT NULL,
  tokens integer NOT NULL,
  calls integer NOT NULL,
  error text
);
CREATE INDEX desk_runs_user_created ON desk_runs (user_id, created_at DESC);
CREATE INDEX desk_runs_user_symbol ON desk_runs (user_id, symbol, created_at DESC);
CREATE TABLE desk_backtests (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  request jsonb NOT NULL,
  status text NOT NULL,
  done integer NOT NULL,
  total integer NOT NULL,
  items jsonb NOT NULL,
  summary jsonb,
  tokens integer NOT NULL,
  created_at timestamptz NOT NULL,
  finished_at timestamptz,
  error text
);
CREATE INDEX desk_backtests_user_created ON desk_backtests (user_id, created_at DESC);
