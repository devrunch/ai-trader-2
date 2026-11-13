CREATE TABLE IF NOT EXISTS "universe_constituents" (
  "index_id" text PRIMARY KEY NOT NULL,
  "members" jsonb NOT NULL,
  "list_date" date NOT NULL,
  "fetched_at" timestamp with time zone NOT NULL,
  "source" text NOT NULL
);
