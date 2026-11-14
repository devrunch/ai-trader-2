ALTER TABLE "news_items" ADD COLUMN IF NOT EXISTS "markets" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "news_items" ADD COLUMN IF NOT EXISTS "sentiment_label" text;
ALTER TABLE "news_items" ADD COLUMN IF NOT EXISTS "sentiment_score" real;
ALTER TABLE "news_items" ADD COLUMN IF NOT EXISTS "sentiment_by" text;
ALTER TABLE "news_items" ADD COLUMN IF NOT EXISTS "crowd" boolean DEFAULT false NOT NULL;
CREATE INDEX IF NOT EXISTS "news_items_symbols" ON "news_items" USING gin ("symbols");
CREATE INDEX IF NOT EXISTS "news_items_markets" ON "news_items" USING gin ("markets");
CREATE INDEX IF NOT EXISTS "news_items_unscored" ON "news_items" ("published_at" DESC) WHERE "sentiment_label" IS NULL;
CREATE TABLE IF NOT EXISTS "user_email_prefs" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reports" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
