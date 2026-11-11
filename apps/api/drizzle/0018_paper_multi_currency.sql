-- Paper trading in every currency (owner decision 2026-11-11): one account per currency; MCX, US and FX segments.
ALTER TABLE paper_accounts DROP CONSTRAINT paper_accounts_currency_check;
--> statement-breakpoint
ALTER TABLE paper_accounts ADD CONSTRAINT paper_accounts_currency_check CHECK (currency ~ '^[A-Z]{3}$');
--> statement-breakpoint
ALTER TABLE paper_orders DROP CONSTRAINT paper_orders_segment_check;
--> statement-breakpoint
ALTER TABLE paper_orders ADD CONSTRAINT paper_orders_segment_check CHECK (segment IN ('equity', 'futures', 'options', 'commodity', 'us-equity', 'forex'));
--> statement-breakpoint
ALTER TABLE paper_positions DROP CONSTRAINT paper_positions_segment_check;
--> statement-breakpoint
ALTER TABLE paper_positions ADD CONSTRAINT paper_positions_segment_check CHECK (segment IN ('equity', 'futures', 'options', 'commodity', 'us-equity', 'forex'));
