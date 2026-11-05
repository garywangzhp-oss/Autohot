CREATE TABLE IF NOT EXISTS localization_attempts (
  entity_kind text NOT NULL CHECK (entity_kind IN ('publication', 'report')),
  entity_id   text NOT NULL,
  lang        text NOT NULL,
  revision    integer NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  outcome     text NOT NULL CHECK (outcome IN ('translated', 'partial', 'skipped', 'failed')),
  reason      text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_kind, entity_id, lang)
);
