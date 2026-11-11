-- One ordered watchlist per user; no row means the user still sees the defaults.
CREATE TABLE watchlists (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  items text[] NOT NULL CHECK (cardinality(items) <= 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
