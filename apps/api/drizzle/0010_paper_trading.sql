CREATE TABLE paper_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency text NOT NULL CHECK (currency IN ('INR')),
  initial_cash numeric(20, 2) NOT NULL,
  cash numeric(20, 2) NOT NULL,
  realised_pnl numeric(20, 2) NOT NULL DEFAULT 0,
  charges numeric(20, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paper_accounts_user_currency_unique UNIQUE (user_id, currency)
);
--> statement-breakpoint
CREATE TABLE paper_orders (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
  client_order_id text NOT NULL,
  instrument_id text NOT NULL,
  segment text CHECK (segment IN ('equity', 'futures', 'options')),
  tick numeric(20, 6) NOT NULL CHECK (tick > 0),
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  type text NOT NULL CHECK (type IN ('market', 'limit', 'stop', 'stop_limit')),
  product text NOT NULL CHECK (product IN ('MIS', 'CNC', 'NRML')),
  quantity integer NOT NULL CHECK (quantity > 0),
  limit_price numeric(20, 6),
  trigger_price numeric(20, 6),
  stop_loss numeric(20, 6),
  target numeric(20, 6),
  status text NOT NULL CHECK (status IN ('open', 'filled', 'cancelled', 'rejected', 'expired')),
  triggered boolean NOT NULL DEFAULT false,
  reject_reason text,
  close_reason text CHECK (close_reason IN ('USER', 'OCO', 'SQUARE_OFF', 'SESSION_END')),
  parent_order_id uuid REFERENCES paper_orders(id) ON DELETE CASCADE,
  reference_price numeric(20, 6),
  fill_price numeric(20, 6),
  placed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  filled_at timestamptz,
  updated_at timestamptz NOT NULL,
  CONSTRAINT paper_orders_account_client_unique UNIQUE (account_id, client_order_id),
  CHECK ((status = 'rejected') = (reject_reason IS NOT NULL)),
  CHECK ((status = 'filled') = (fill_price IS NOT NULL AND filled_at IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX paper_orders_account_placed_idx ON paper_orders (account_id, placed_at);
--> statement-breakpoint
CREATE INDEX paper_orders_open_idx ON paper_orders (expires_at) WHERE status = 'open';
--> statement-breakpoint
CREATE TABLE paper_fills (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES paper_orders(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
  instrument_id text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  product text NOT NULL CHECK (product IN ('MIS', 'CNC', 'NRML')),
  quantity integer NOT NULL CHECK (quantity > 0),
  price numeric(20, 6) NOT NULL,
  slippage numeric(20, 6) NOT NULL,
  brokerage numeric(20, 2) NOT NULL,
  stt numeric(20, 2) NOT NULL,
  exchange_charges numeric(20, 2) NOT NULL,
  sebi numeric(20, 2) NOT NULL,
  stamp numeric(20, 2) NOT NULL,
  gst numeric(20, 2) NOT NULL,
  total_charges numeric(20, 2) NOT NULL,
  realised_pnl numeric(20, 2) NOT NULL,
  filled_at timestamptz NOT NULL,
  CONSTRAINT paper_fills_order_unique UNIQUE (order_id)
);
--> statement-breakpoint
CREATE INDEX paper_fills_account_filled_idx ON paper_fills (account_id, filled_at);
--> statement-breakpoint
CREATE TABLE paper_positions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
  instrument_id text NOT NULL,
  segment text NOT NULL CHECK (segment IN ('equity', 'futures', 'options')),
  tick numeric(20, 6) NOT NULL CHECK (tick > 0),
  product text NOT NULL CHECK (product IN ('MIS', 'CNC', 'NRML')),
  quantity integer NOT NULL,
  average_price numeric(20, 6) NOT NULL,
  realised_pnl numeric(20, 2) NOT NULL,
  square_off_at timestamptz,
  updated_at timestamptz NOT NULL,
  CONSTRAINT paper_positions_account_instrument_product_unique UNIQUE (account_id, instrument_id, product)
);
--> statement-breakpoint
CREATE INDEX paper_positions_square_off_idx ON paper_positions (square_off_at) WHERE product = 'MIS' AND quantity <> 0;
