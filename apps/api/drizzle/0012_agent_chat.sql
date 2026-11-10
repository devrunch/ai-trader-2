-- Agent chat: threads per user (FR-AG-9), their UI messages, and one row per turn recording the prompt version and model used.
CREATE TABLE agent_threads (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX agent_threads_user_updated ON agent_threads (user_id, updated_at DESC);
--> statement-breakpoint
CREATE TABLE agent_messages (
  thread_id uuid NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  seq integer NOT NULL CHECK (seq >= 0),
  message jsonb NOT NULL,
  PRIMARY KEY (thread_id, seq)
);
--> statement-breakpoint
CREATE TABLE agent_turns (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL,
  prompt_key text NOT NULL,
  prompt_version integer NOT NULL CHECK (prompt_version >= 0),
  model text NOT NULL,
  outcome text,
  tokens integer CHECK (tokens >= 0),
  started_at timestamptz NOT NULL,
  finished_at timestamptz
);
--> statement-breakpoint
CREATE INDEX agent_turns_prompt ON agent_turns (prompt_key, prompt_version);
