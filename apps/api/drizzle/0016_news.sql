-- Market news headlines from public feeds, tagged with the instruments they mention.
CREATE TABLE news_items (
  id text PRIMARY KEY,
  source text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  url text NOT NULL,
  summary text CHECK (length(summary) <= 2000),
  published_at timestamptz NOT NULL,
  symbols text[] NOT NULL DEFAULT '{}',
  fetched_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX news_items_published ON news_items (published_at DESC);
--> statement-breakpoint
CREATE INDEX news_items_symbols ON news_items USING gin (symbols);
