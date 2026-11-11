-- What the assistant remembers about each user across conversations: short notes it writes when asked or when it learns a lasting preference.
CREATE TABLE agent_memory (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note text NOT NULL CHECK (length(note) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX agent_memory_user ON agent_memory (user_id, created_at);
