-- Last Kite auto-login failure ({stage, message, httpStatus?, at}), cleared on a successful mint.
ALTER TABLE vendor_sessions ADD COLUMN last_login_failure jsonb;
