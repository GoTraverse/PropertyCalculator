-- 001_init.sql — EquitySight platform schema (Phase 1 foundation)
-- Apply against the Neon database referenced by DATABASE_URL.
-- See ARCHITECTURE.md §4 for the design rationale.
--
--   psql "$DATABASE_URL" -f db/migrations/001_init.sql
--
-- Idempotent: safe to run more than once (IF NOT EXISTS throughout).

-- Canonical suburb registry — everything hangs off this.
CREATE TABLE IF NOT EXISTS suburbs (
  id            BIGSERIAL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,            -- e.g. 'vic/st-kilda'
  name          TEXT NOT NULL,
  state         TEXT NOT NULL,
  postcode      TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  -- boundary GEOMETRY(MultiPolygon, 4326),      -- enable with PostGIS in Phase 3
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Provenance for every fact (trust / E-E-A-T).
CREATE TABLE IF NOT EXISTS sources (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  url           TEXT,
  licence       TEXT,
  retrieved_at  TIMESTAMPTZ
);

-- Append-only time series. Never UPDATE; insert a new dated row.
CREATE TABLE IF NOT EXISTS suburb_metrics (
  id            BIGSERIAL PRIMARY KEY,
  suburb_id     BIGINT NOT NULL REFERENCES suburbs(id),
  metric        TEXT NOT NULL,
  value         DOUBLE PRECISION NOT NULL,
  unit          TEXT,
  as_at_date    DATE NOT NULL,
  source_id     BIGINT REFERENCES sources(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (suburb_id, metric, as_at_date, source_id)
);
CREATE INDEX IF NOT EXISTS ix_metrics_suburb_metric_date ON suburb_metrics (suburb_id, metric, as_at_date DESC);
CREATE INDEX IF NOT EXISTS ix_metrics_metric_date        ON suburb_metrics (metric, as_at_date DESC);

-- Dated events → Suburb Timeline + Watchlist alerts.
CREATE TABLE IF NOT EXISTS suburb_events (
  id            BIGSERIAL PRIMARY KEY,
  suburb_id     BIGINT NOT NULL REFERENCES suburbs(id),
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  event_date    DATE NOT NULL,
  importance    SMALLINT NOT NULL DEFAULT 3,
  source_id     BIGINT REFERENCES sources(id),
  meta          JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (suburb_id, type, title, event_date)
);
CREATE INDEX IF NOT EXISTS ix_events_suburb_date ON suburb_events (suburb_id, event_date DESC);
CREATE INDEX IF NOT EXISTS ix_events_type_date   ON suburb_events (type, event_date DESC);

-- Phase 4 (watchlists/alerts) — deferred; user identity stays in Redis.
-- CREATE TABLE IF NOT EXISTS watchlists (...);
-- CREATE TABLE IF NOT EXISTS alerts     (...);
