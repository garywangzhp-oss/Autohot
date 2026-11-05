CREATE TABLE IF NOT EXISTS newsletter_deliveries (
  subscription_email text NOT NULL REFERENCES email_subscriptions(email) ON DELETE CASCADE,
  report_id bigint NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  lang text NOT NULL CHECK (lang IN ('zh', 'en')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  receipt_id bigint REFERENCES receipts(id),
  provider_message_id text,
  error text,
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_email, report_id, lang)
);
