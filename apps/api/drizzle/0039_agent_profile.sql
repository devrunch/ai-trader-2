CREATE TABLE IF NOT EXISTS "agent_profile" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "data" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "agent_signals" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event_key" text NOT NULL,
  "kind" text NOT NULL,
  "topic" text NOT NULL,
  "tools" text[] DEFAULT '{}' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "agent_signals_event" ON "agent_signals" ("user_id", "event_key");
ALTER TABLE "agent_turns" ADD COLUMN IF NOT EXISTS "tools" text[] DEFAULT '{}' NOT NULL;
