CREATE TABLE "bars_1d" (
	"instrument_id" text NOT NULL,
	"session_date" date NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"volume" double precision,
	"source" text NOT NULL,
	"repaired" boolean DEFAULT false NOT NULL,
	"adj_factor" double precision DEFAULT 1 NOT NULL,
	CONSTRAINT "bars_1d_instrument_id_session_date_pk" PRIMARY KEY("instrument_id","session_date")
);
