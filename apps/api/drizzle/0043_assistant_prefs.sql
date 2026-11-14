CREATE TABLE IF NOT EXISTS "assistant_prefs" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "mode" text NOT NULL,
  "max_risk_pct" real NOT NULL,
  "max_trades_per_day" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
