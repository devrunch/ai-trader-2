CREATE EXTENSION IF NOT EXISTS citext;
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username citext NOT NULL UNIQUE CHECK (username::text = lower(username::text) AND length(username) BETWEEN 3 AND 32 AND username::text ~ '^[a-z0-9_.-]+$'),
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'user')),
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled boolean NOT NULL DEFAULT false,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until timestamptz
);
