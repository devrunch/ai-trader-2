ALTER TABLE vendor_sessions ADD COLUMN auto_login_blocked_until timestamptz;
ALTER TABLE vendor_sessions ADD COLUMN auto_login_block_reason text;
