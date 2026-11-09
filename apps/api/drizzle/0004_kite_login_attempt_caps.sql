ALTER TABLE vendor_sessions ALTER COLUMN access_token DROP NOT NULL;
ALTER TABLE vendor_sessions ALTER COLUMN minted_at DROP NOT NULL;
ALTER TABLE vendor_sessions ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE vendor_sessions ADD COLUMN login_attempts_day date;
ALTER TABLE vendor_sessions ADD COLUMN login_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE vendor_sessions ADD COLUMN login_attempts_window timestamptz[] NOT NULL DEFAULT '{}';
