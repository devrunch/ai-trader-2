-- Company fundamentals (screener.in): one row per fetch, so a replay at a past time reads the newest record that existed then.
CREATE TABLE fundamentals (
  symbol text NOT NULL,
  consolidated boolean NOT NULL,
  source text NOT NULL,
  fetched_at timestamptz NOT NULL,
  report_date date,
  data jsonb NOT NULL,
  PRIMARY KEY (symbol, fetched_at)
);
CREATE INDEX fundamentals_fetched ON fundamentals (fetched_at DESC);
