CREATE TABLE "instrument_changes" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"id" text NOT NULL,
	"successor" text,
	"at" timestamp with time zone NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instrument_mappings" (
	"id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_symbol" text NOT NULL,
	"provider_token" text,
	CONSTRAINT "instrument_mappings_id_provider_pk" PRIMARY KEY("id","provider"),
	CONSTRAINT "instrument_mappings_provider_symbol_unique" UNIQUE("provider","provider_symbol")
);
--> statement-breakpoint
CREATE TABLE "instrument_source_status" (
	"source" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"last_success_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone NOT NULL,
	"instrument_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" text PRIMARY KEY NOT NULL,
	"exchange" text NOT NULL,
	"ticker" text NOT NULL,
	"description" text NOT NULL,
	"type" text NOT NULL,
	"currency" text NOT NULL,
	"timezone" text NOT NULL,
	"session" text NOT NULL,
	"pricescale" integer NOT NULL,
	"minmov" numeric NOT NULL,
	"lot_size" integer NOT NULL,
	"expiry" date,
	"strike" numeric,
	"option_type" text,
	"underlying" text,
	"isin" text,
	"sector" text,
	"has_intraday" boolean NOT NULL,
	"volume_type" text NOT NULL,
	"status" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instrument_mappings" ADD CONSTRAINT "instrument_mappings_id_instruments_id_fk" FOREIGN KEY ("id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "instrument_changes_id_idx" ON "instrument_changes" USING btree ("id");--> statement-breakpoint
CREATE INDEX "instrument_changes_successor_idx" ON "instrument_changes" USING btree ("successor");--> statement-breakpoint
CREATE INDEX "instruments_source_idx" ON "instruments" USING btree ("source");--> statement-breakpoint
CREATE INDEX "instruments_status_idx" ON "instruments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "instruments_underlying_idx" ON "instruments" USING btree ("underlying");--> statement-breakpoint
CREATE INDEX "instruments_expiry_idx" ON "instruments" USING btree ("expiry");