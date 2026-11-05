CREATE TABLE IF NOT EXISTS publication_localizations (
  article_id    text NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  lang          text NOT NULL CHECK (lang = 'en'),
  revision      integer NOT NULL,
  title         text NOT NULL,
  summary       text,
  reason        text,
  body_html     text,
  body_text     text,
  body_complete boolean NOT NULL DEFAULT true,
  origin        text NOT NULL DEFAULT 'model' CHECK (origin IN ('model', 'replay', 'source')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, lang)
);
