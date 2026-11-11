-- Scheduled economic releases (CPI, payrolls, central banks) from a public weekly calendar.
CREATE TABLE economic_events (
  id text PRIMARY KEY,
  title text NOT NULL,
  country text NOT NULL,
  at timestamptz NOT NULL,
  impact text NOT NULL CHECK (impact IN ('High', 'Medium', 'Low', 'Holiday')),
  forecast text,
  previous text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX economic_events_at ON economic_events (at);
