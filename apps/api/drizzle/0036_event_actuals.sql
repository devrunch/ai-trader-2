ALTER TABLE "economic_events" ADD COLUMN IF NOT EXISTS "actual" text;
--> statement-breakpoint
ALTER TABLE "economic_events" ADD COLUMN IF NOT EXISTS "actual_source" text;
--> statement-breakpoint
ALTER TABLE "economic_events" ADD COLUMN IF NOT EXISTS "actual_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "economic_events" ADD COLUMN IF NOT EXISTS "surprise" double precision;
--> statement-breakpoint
ALTER TABLE "economic_events" ADD COLUMN IF NOT EXISTS "surprise_z" double precision;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "economic_events_title_at" ON "economic_events" USING btree ("country","title","at");
