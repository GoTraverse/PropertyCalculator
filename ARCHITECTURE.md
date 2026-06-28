# EquitySight Platform Architecture

Companion to `ROADMAP.md`. This is the technical blueprint for evolving from a
static calculator site into a suburb-centric property-intelligence platform.

Status: **proposed** (no app behaviour changed yet). The only code shipped with
this document is a read-only DB health-check spike (`netlify/functions/db-health.js`)
that proves a Netlify Function can reach Neon — it does nothing until a database
URL is configured.

---

## 1. Where we are today

| Layer | Today |
|---|---|
| Frontend | Static HTML/CSS/JS, no framework, no client build step |
| Page generation | Build-time: `build.js` renders ~3,022 indexed suburb pages from `data/suburbs.json` (ABS 2021) |
| Backend | 14 Netlify Functions (Node, esbuild-bundled) |
| Data store | **Upstash Redis** — users, sessions, scenarios, reviews, comments, blog, SEO snapshots, public shares |
| Hosting | Netlify (`publish = "."`, functions in `netlify/functions/`) |

Redis is a key-value store. It's excellent for what it does here (sessions,
rate limits, blobs of JSON) but it cannot do relational joins, time-series
range queries, or geospatial queries — all of which the roadmap needs.

## 2. The shift, in one sentence

Introduce **PostgreSQL as the source of truth for suburb data** (metrics +
events + boundaries), keep **Redis for caching only**, and keep everything else
exactly as it is. This is **additive, not a rewrite.**

---

## 3. Database choice: Neon

**Recommendation: [Neon](https://neon.tech) (serverless Postgres).**

Why Neon over the alternatives:

| Option | Verdict |
|---|---|
| **Neon** | ✅ Serverless, scales to zero, **HTTP driver** (`@neondatabase/serverless`) ideal for stateless Functions (no connection-pool exhaustion), PostGIS available, generous free tier, DB branching for safe migrations. **Netlify DB is Neon under the hood** — first-party integration. |
| Supabase | Good Postgres + PostGIS, but bundles auth/storage/realtime we don't need (we already have auth in Redis). More surface area than required. |
| RDS / Cloud SQL | Always-on, connection-pool pain from serverless, heavier ops. Overkill at this stage. |
| Stay on Redis | Can't do time-series, joins, or geo. Non-starter for the platform vision. |

**Connection model (critical for serverless):** Netlify Functions are stateless
and can cold-start in parallel. A traditional `pg` pool will exhaust Postgres
connections under load. Neon's HTTP driver (`@neondatabase/serverless`) issues
each query over HTTPS — no persistent socket, no pool to exhaust — which matches
the Functions model perfectly. Use it for all request-path queries. For
long-running background imports, a pooled connection (Neon's pooled endpoint) is
fine.

**Env vars** (set in Netlify → Site settings → Environment variables):
- `DATABASE_URL` — Neon pooled connection string (for background jobs)
- `DATABASE_URL_UNPOOLED` / direct — for migrations
- The HTTP driver just needs `DATABASE_URL`.

---

## 4. Schema — suburb-centric, append-only

Two disciplines drive every design choice:
1. **Everything hangs off `suburbs`.**
2. **Never overwrite a fact — insert a new dated row.** This is what makes
   Replay Mode, historical timelines, and "what did this suburb look like in
   2021 vs 2026" possible *for free* later.

```sql
-- Canonical suburb registry. One row per suburb, stable id + slug.
CREATE TABLE suburbs (
  id            BIGSERIAL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,          -- e.g. 'vic/st-kilda'
  name          TEXT NOT NULL,
  state         TEXT NOT NULL,                 -- NSW, VIC, ...
  postcode      TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  -- boundary GEOMETRY(MultiPolygon, 4326),   -- enable when PostGIS is on (heat map)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Data provenance. Every metric and event cites a source → trust / E-E-A-T.
CREATE TABLE sources (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,                 -- 'ABS Census 2021', 'QLD Dept of Transport'
  url           TEXT,
  licence       TEXT,
  retrieved_at  TIMESTAMPTZ
);

-- APPEND-ONLY time series. Powers heat-map layers, replay, comparison charts.
-- Never UPDATE a value; insert a new row with a later as_at_date.
CREATE TABLE suburb_metrics (
  id            BIGSERIAL PRIMARY KEY,
  suburb_id     BIGINT NOT NULL REFERENCES suburbs(id),
  metric        TEXT NOT NULL,                 -- 'median_house_price','rental_yield','vacancy_rate','population','growth_score'
  value         DOUBLE PRECISION NOT NULL,
  unit          TEXT,                          -- 'AUD','percent','count'
  as_at_date    DATE NOT NULL,                 -- the date the value is true *for*
  source_id     BIGINT REFERENCES sources(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (suburb_id, metric, as_at_date, source_id)
);
CREATE INDEX ix_metrics_suburb_metric_date ON suburb_metrics (suburb_id, metric, as_at_date DESC);
CREATE INDEX ix_metrics_metric_date        ON suburb_metrics (metric, as_at_date DESC); -- heat-map "latest per suburb"

-- Discrete dated happenings. Powers the Suburb Timeline + Watchlist alerts.
CREATE TABLE suburb_events (
  id            BIGSERIAL PRIMARY KEY,
  suburb_id     BIGINT NOT NULL REFERENCES suburbs(id),
  type          TEXT NOT NULL,                 -- 'census','infrastructure','hospital','school','transport','planning','grant','olympic','market'
  title         TEXT NOT NULL,
  body          TEXT,
  event_date    DATE NOT NULL,
  importance    SMALLINT NOT NULL DEFAULT 3,   -- 1=minor .. 5=major (drives alert thresholds + timeline emphasis)
  source_id     BIGINT REFERENCES sources(id),
  meta          JSONB,                         -- type-specific extras (cost, stage, operator, etc.)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (suburb_id, type, title, event_date)  -- idempotent ingestion
);
CREATE INDEX ix_events_suburb_date ON suburb_events (suburb_id, event_date DESC);
CREATE INDEX ix_events_type_date   ON suburb_events (type, event_date DESC);

-- Phase 4 (watchlists/alerts) — sketched now so the event model accounts for it.
-- CREATE TABLE watchlists (id, user_id, suburb_id, created_at, UNIQUE(user_id,suburb_id));
-- CREATE TABLE alerts     (id, user_id, suburb_id, event_id, sent_at, channel);
```

Notes:
- `user_id` for watchlists references the **Redis** user (`session.id`) — we are
  *not* migrating auth to Postgres. The platform DB is for suburb data; identity
  stays in Redis. (A `users` mirror can come later if joins are ever needed.)
- The `UNIQUE` constraints on metrics/events make ingestion **idempotent** —
  re-running an import inserts only genuinely new rows (`ON CONFLICT DO NOTHING`).

### How each feature reads this schema
| Feature | Query shape |
|---|---|
| Suburb Timeline | `suburb_events WHERE suburb_id=? ORDER BY event_date DESC` |
| Heat Map (layer) | latest `suburb_metrics` per suburb for `metric=?` (window/DISTINCT ON) |
| Replay Mode | `suburb_metrics WHERE as_at_date <= :sliderDate` (latest ≤ date) |
| Comparison | both of the above for two `suburb_id`s |
| Reports | the same queries, formatted to HTML/PDF |
| Watchlist alerts | new `suburb_events` rows since a user's last-seen, filtered by `importance` |

---

## 5. Ingestion / background jobs

Datasets become rows via small, idempotent importer scripts under `jobs/`:

```
jobs/
  import-abs-census.js        -- population, income, dwellings → suburb_metrics (+ a 'census' event)
  import-infrastructure.js    -- state transport/health/planning datasets → suburb_events
  import-market.js            -- median price / yield / vacancy feeds → suburb_metrics
  derive-growth-score.js      -- computes growth_score from metrics → suburb_metrics
```

Principles:
- **Idempotent**: `INSERT … ON CONFLICT DO NOTHING`, keyed by the UNIQUE
  constraints above. Safe to re-run.
- **Append, don't overwrite**: a new census year inserts new `as_at_date` rows;
  old rows stay (that's the timeline + replay).
- **Provenance**: every job writes/*reuses* a `sources` row and stamps it on
  each metric/event.
- **Scheduling**: run via Netlify Scheduled Functions (cron) or manually from an
  admin button (mirrors the existing "Rebuild Suburb Pages" pattern). Heavy
  back-fills run locally against the Neon pooled endpoint and commit nothing to
  the app — they just populate the DB.
- **Event generation is derived, not hand-written** — e.g. the census importer
  emits a "2021 Census: population 12,430 (+8%)" event automatically.

---

## 6. Coexistence with the current stack (no rewrite)

The static suburb pages keep working. We enrich them incrementally:

1. **Phase 1 — read path only.** A new `netlify/functions/suburb-data.js`
   endpoint serves timeline/metrics JSON for a suburb from Neon (cached in Redis
   for ~1h). The existing static suburb page fetches it client-side and renders a
   **Timeline** section. Nothing else changes. If Neon is down, the page still
   renders (graceful degradation) — the timeline section just hides.
2. **Phase 2 — build-time enrichment.** Once data is trusted, `build-suburbs.js`
   can read from Neon at build time to bake the timeline into static HTML (better
   SEO than client fetch). Redis caches the query results between builds.
3. **`data/suburbs.json` becomes a seed**, not the source of truth — migrated
   into `suburbs` once, then Postgres owns it.

Redis role is unchanged except it gains a caching tier for DB reads.

---

## 7. Phasing (maps to ROADMAP build sequencing)

| Phase | Deliverable | Unlocks |
|---|---|---|
| **0 — Spike** (this PR) | `db-health.js` proves a Function reaches Neon | confidence in the connection model |
| **1 — Foundation + Timeline** | Neon project, schema migration, migrate `suburbs.json`, first ingestion (census + sample infra), `suburb-data` endpoint, timeline UI on suburb pages | Suburb Timeline (roadmap #2) + the reusable data layer |
| **2 — Comparison + Reports** | comparison page + report generator over the same data | roadmap #5, #6 |
| **3 — Heat Map** | PostGIS boundaries / simplified GeoJSON + MapLibre GL + layer toggles | roadmap #1, Replay (#3) |
| **4 — Watchlists + Alerts** | watchlist tables, alert job over the event stream | roadmap #4 |

---

## 8. Risks & decisions to confirm before Phase 1
- **Cost/quota**: confirm Neon tier (free tier is fine to start; ~3k suburbs ×
  metrics is small).
- **PostGIS**: needed for the heat map (Phase 3), not Phase 1 — enable when we
  get there to keep Phase 1 simple.
- **Boundary data licensing**: ABS ASGS suburb boundaries are open; confirm
  before shipping the map.
- **Market data licensing**: median price / yield / vacancy feeds (Domain /
  CoreLogic / PropTrack) are *licensed* — Phase 1 uses ABS (open) only; paid
  feeds need a contract before they go live. Document on `/data-sources`.

---

## 9. The Phase 0 spike (shipped with this doc)

`netlify/functions/db-health.js` — **admin-only**, read-only. With
`DATABASE_URL` set to a Neon connection string it runs `SELECT now()` and reports
which platform tables exist. With no `DATABASE_URL` it returns a clear
"not configured" message and changes nothing. This is the smallest possible
proof that the Neon + Functions connection model works before we invest in
Phase 1.

**To run the spike:**
1. Create a Neon project (or Netlify DB) → copy the connection string.
2. Netlify → Environment variables → add `DATABASE_URL`.
3. (Optional) apply `db/migrations/001_init.sql` to create the tables.
4. As an admin, GET `/.netlify/functions/db-health` → expect
   `{ ok: true, connected: true, now: "...", tables: [...] }`.
