CREATE TABLE "vendor_sessions" (
	"vendor" text PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"minted_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
