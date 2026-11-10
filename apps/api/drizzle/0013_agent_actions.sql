-- Action cards the assistant proposes and the user applies or dismisses (FR-AG-17).
CREATE TABLE agent_actions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('pending', 'applied', 'dismissed', 'expired', 'failed')),
  reason text CHECK (length(reason) <= 300),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
