-- In-app notifications: background task runs, paper fills (entries, stops, targets, square-offs).
CREATE TABLE notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('task', 'fill', 'system')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  body text CHECK (length(body) <= 2000),
  link jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
--> statement-breakpoint
CREATE INDEX notifications_user_created ON notifications (user_id, created_at DESC);
