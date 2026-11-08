CREATE TABLE bars_1m (
  instrument_id text NOT NULL,
  ts timestamptz NOT NULL,
  open double precision NOT NULL,
  high double precision NOT NULL,
  low double precision NOT NULL,
  close double precision NOT NULL,
  volume double precision,
  source text NOT NULL,
  repaired boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bars_1m_instrument_id_ts_pk PRIMARY KEY (instrument_id, ts)
) PARTITION BY RANGE (ts);
--> statement-breakpoint
CREATE FUNCTION create_bars_1m_partition(month date) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  first_day date := date_trunc('month', month)::date;
  next_month date := (first_day + interval '1 month')::date;
  partition_name text := 'bars_1m_' || to_char(first_day, 'YYYYMM');
BEGIN
  -- Serialize DDL across writers; repeated deliveries are safe.
  PERFORM pg_advisory_xact_lock(hashtext('bars_1m_partitions'));
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF bars_1m FOR VALUES FROM (%L) TO (%L)',
    partition_name, first_day::text || ' 00:00:00+00', next_month::text || ' 00:00:00+00');
END;
$$;
