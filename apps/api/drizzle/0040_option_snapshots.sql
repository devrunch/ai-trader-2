CREATE TABLE IF NOT EXISTS "option_snapshots" (
  "underlying" text NOT NULL,
  "expiry" text NOT NULL,
  "taken_at" timestamp with time zone NOT NULL,
  "spot" double precision,
  "legs" jsonb NOT NULL,
  CONSTRAINT "option_snapshots_underlying_expiry_taken_at_pk" PRIMARY KEY ("underlying", "expiry", "taken_at")
);
CREATE INDEX IF NOT EXISTS "option_snapshots_taken" ON "option_snapshots" ("taken_at");
