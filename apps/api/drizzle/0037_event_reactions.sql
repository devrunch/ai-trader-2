CREATE TABLE IF NOT EXISTS "event_reactions" (
  "event_id" text NOT NULL,
  "symbol" text NOT NULL,
  "ref_price" double precision,
  "move5_pct" double precision,
  "move15_pct" double precision,
  "move60_pct" double precision,
  "computed_at" timestamp with time zone NOT NULL,
  CONSTRAINT "event_reactions_event_id_symbol_pk" PRIMARY KEY ("event_id", "symbol")
);
