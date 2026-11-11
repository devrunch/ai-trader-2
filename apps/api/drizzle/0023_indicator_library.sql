-- Per-user indicator presets (name NULL = the user's default for that indicator) and chart templates.
CREATE TABLE indicator_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  indicator_id text NOT NULL,
  name text,
  inputs jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX indicator_presets_default ON indicator_presets (user_id, indicator_id) WHERE name IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX indicator_presets_named ON indicator_presets (user_id, indicator_id, name) WHERE name IS NOT NULL;
--> statement-breakpoint
CREATE TABLE indicator_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  favourite boolean NOT NULL DEFAULT false,
  items jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
