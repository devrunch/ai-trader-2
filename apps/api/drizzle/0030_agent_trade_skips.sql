-- A journal row with `skipped` set records an entry the assistant decided not to take (no order was placed).
ALTER TABLE agent_trades ADD COLUMN skipped text;
