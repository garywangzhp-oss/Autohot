CREATE TABLE IF NOT EXISTS report_localizations (
  report_id  bigint NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  lang       text NOT NULL CHECK (lang = 'en'),
  revision   integer NOT NULL,
  content    jsonb NOT NULL,
  origin     text NOT NULL DEFAULT 'model' CHECK (origin IN ('model', 'replay', 'source')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, lang)
);
