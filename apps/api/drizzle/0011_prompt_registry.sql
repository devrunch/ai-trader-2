-- Admin-editable agent prompts, append-only like commits (owner request 2026-11-10). The newest version is active.
CREATE TABLE prompt_versions (
  key text NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  version integer NOT NULL CHECK (version > 0),
  content text NOT NULL CHECK (length(content) <= 100000),
  parent_version integer CHECK (parent_version >= 0),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 500),
  author text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, version)
);
