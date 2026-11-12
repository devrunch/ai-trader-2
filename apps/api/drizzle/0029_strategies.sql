-- Saved backtest strategies; variant_hashes counts distinct parameter sets run against each (FR-BT-2).
CREATE TABLE strategies (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  spec jsonb NOT NULL,
  variant_hashes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX strategies_user_updated ON strategies (user_id, updated_at DESC);
