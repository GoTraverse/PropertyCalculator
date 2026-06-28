# EquitySight Roadmap

**Vision:** evolve EquitySight from a property finance *calculator website* into
**Australia's most trusted property intelligence platform** — a place where
Australians understand how suburbs change over time.

The calculators remain a core feature, but become one part of a larger,
data-driven platform.

> **Guardrail:** No AI features yet. Build value through *data, visualisation,
> and UX* first. (When we do add AI later, it sits on top of the data platform
> described in `ARCHITECTURE.md`, not instead of it.)

---

## Immediate priorities (run in parallel with platform work)
These are low-risk and don't depend on the new data layer:
- Polish existing calculators and UX
- Improve the mobile experience
- Keep growing users and trust (SEO recovery + the share-loop shipped Jun 2026)
- Calculators remain the core product *for now*

---

## Future features

Five of the six features below are **different views of the same data**. They
all read from the suburb-centric, append-only, event-based store defined in
`ARCHITECTURE.md`. Build the foundation once; each feature is then a thin
rendering layer.

### 1. Interactive Heat Map
Australia map with suburb boundaries and switchable layers:
Growth Score · Median House Price · Rental Yield · Vacancy Rate ·
Population Growth · Infrastructure · Government Grants · Olympic Projects.
Click a suburb → side information panel. Advanced filtering.

### 2. Suburb Timeline — **highest priority**
Every suburb gets a dynamic timeline, **generated from database events** (never
hardcoded): census updates, population changes, infrastructure projects,
hospitals, schools, transport, planning approvals, government grants, Olympic
projects, property-market milestones.

*Why first:* it's the highest user value **and** building it forces the whole
data foundation (suburbs + historical metrics + events + ingestion). It is the
ideal first vertical slice.

### 3. Replay Mode
A time slider to watch suburbs — and Australia — evolve. Comes almost for free
if metrics are stored append-only with an `as_at_date` (see DB philosophy).

### 4. Watchlists
Users save suburbs and later receive alerts when important events occur.
Needs the event stream from feature 2.

### 5. Suburb Comparison
Compare two suburbs across charts, demographics, market data, infrastructure,
and timelines. Same queries as the timeline/heat map, different view.

### 6. Dynamic Reports
Auto-generate suburb reports from existing data. Same data, formatted output.

---

## Technical direction
- **PostgreSQL** as the source of truth (recommended host: **Neon** — serverless,
  Netlify-native, PostGIS for boundaries). See `ARCHITECTURE.md`.
- **Redis** for caching only.
- **Netlify** frontend (no rewrite — Postgres is introduced *alongside* the
  current static + Functions stack).
- **Background jobs** for importing datasets and generating events.

## Database philosophy
- **Everything revolves around suburbs.**
- **Store historical data instead of overwriting it** (append-only, dated rows).
- Each new dataset automatically powers heat maps, timelines, reports, search,
  filters, and future alerts — because they all read the same tables.

---

## Brand direction
| | |
|---|---|
| **Current** | Property finance calculators |
| **Future** | Australia's most trusted property intelligence platform |

The calculators stay important, but become part of a much larger platform
focused on helping Australians understand how suburbs change over time.

---

## Build sequencing
1. **Foundation + Timeline vertical slice** — Neon + schema + migrate suburbs +
   first event ingestion + timeline on suburb pages. *Proves the architecture.*
2. **Comparison + Reports** — cheap once the data exists (same queries).
3. **Heat Map** — bigger (boundaries / vector tiles + MapLibre); data layer
   already feeds it.
4. **Watchlists + Alerts** — built on the event stream from step 1.

See `ARCHITECTURE.md` for the schema, ingestion design, coexistence plan, and
phasing detail.
