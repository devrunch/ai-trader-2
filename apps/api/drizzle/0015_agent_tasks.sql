-- Background assistant tasks: run on a schedule or when a price or indicator condition becomes true.
CREATE TABLE agent_tasks (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  instruction text NOT NULL CHECK (length(instruction) BETWEEN 1 AND 2000),
  trigger jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'paused', 'done', 'cancelled', 'expired')),
  runs integer NOT NULL DEFAULT 0 CHECK (runs >= 0),
  max_runs integer NOT NULL CHECK (max_runs BETWEEN 1 AND 500),
  armed boolean NOT NULL,
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_error text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX agent_tasks_active ON agent_tasks (state) WHERE state = 'active';
--> statement-breakpoint
CREATE INDEX agent_tasks_user ON agent_tasks (user_id, created_at DESC);
