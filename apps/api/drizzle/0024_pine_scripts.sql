-- Saved Pine scripts per user, with an append-only version history (the application keeps the newest 50).
CREATE TABLE pine_scripts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX pine_scripts_user_updated ON pine_scripts (user_id, updated_at DESC);
--> statement-breakpoint
CREATE TABLE pine_script_versions (
  script_id uuid NOT NULL REFERENCES pine_scripts(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  source text NOT NULL CHECK (length(source) BETWEEN 1 AND 100000),
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (script_id, version)
);
