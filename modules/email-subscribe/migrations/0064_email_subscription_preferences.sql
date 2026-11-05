CREATE TABLE IF NOT EXISTS email_subscription_preferences (
  email text PRIMARY KEY REFERENCES email_subscriptions(email) ON DELETE CASCADE,
  lang text NOT NULL CHECK (lang IN ('zh', 'en')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'unsubscribed')),
  confirm_token_hash text UNIQUE,
  confirm_expires_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
