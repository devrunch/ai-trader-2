CREATE TABLE IF NOT EXISTS "what_to_watch" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL,
  "items" jsonb NOT NULL,
  "open" boolean DEFAULT true NOT NULL
);
CREATE INDEX IF NOT EXISTS "what_to_watch_user_created" ON "what_to_watch" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "what_to_watch_open" ON "what_to_watch" ("open") WHERE "open";
