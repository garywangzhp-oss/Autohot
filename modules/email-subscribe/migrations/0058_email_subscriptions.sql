CREATE TABLE IF NOT EXISTS email_subscriptions (
  email text PRIMARY KEY,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz
);
