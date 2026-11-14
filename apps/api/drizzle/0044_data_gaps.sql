CREATE TABLE IF NOT EXISTS "agent_data_gaps" (
  "tool" text NOT NULL,
  "subject" text NOT NULL,
  "reason" text NOT NULL,
  "count" integer DEFAULT 1 NOT NULL,
  "example" text,
  "first_seen" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_data_gaps_pk" PRIMARY KEY ("tool", "subject", "reason")
);
