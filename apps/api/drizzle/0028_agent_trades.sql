-- What a task may trade by itself (paper), and the journal of every order the assistant placed.
ALTER TABLE agent_tasks ADD COLUMN auto_trade jsonb;
CREATE TABLE agent_trades (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id uuid,
  created_at timestamptz NOT NULL,
  venue text NOT NULL,
  trigger_text text NOT NULL,
  skill text,
  rationale text NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL,
  quantity integer NOT NULL,
  entry double precision,
  stop_loss double precision,
  target double precision,
  risk_amount double precision,
  currency text NOT NULL,
  backtest text,
  client_order_id text NOT NULL
);
CREATE UNIQUE INDEX agent_trades_client_order ON agent_trades (user_id, client_order_id);
CREATE INDEX agent_trades_user_created ON agent_trades (user_id, created_at DESC);
CREATE INDEX agent_trades_task_created ON agent_trades (task_id, created_at);

-- Per-user broker opt-in (development only; default off).
CREATE TABLE execution_prefs (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  broker_opt_in boolean NOT NULL DEFAULT false
);
