-- A user's saved screener specs.
CREATE TABLE saved_screens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  spec jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX saved_screens_user_updated ON saved_screens (user_id, updated_at DESC);
