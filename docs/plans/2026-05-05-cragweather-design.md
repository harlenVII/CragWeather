# CragWeather — Design

**Date:** 2026-05-05
**Status:** Approved, ready for implementation plan

## Goal

A website where a user searches for a rock-climbing route and sees the weather over a 14-day window centered on today (7 days past, 7 days forecast). v1 uses Mountain Project route data; v2 expands to crag-name and coordinate search.

## Why this shape

- **Mountain Project has the comprehensive route data climbers actually use**, but its public API was deprecated in late 2020 and onX is not issuing new keys. The only practical data path is parsing public pages.
- **Sitemaps are fair game**: MP advertises `sitemap.xml` for crawling, with a 60-second crawl-delay. The sitemap gives `{routeId, slug}` for every route — enough to power search.
- **Per-route metadata (lat/lng, area, grade) is fetched lazily, once ever**, when a user first clicks a route. Cached permanently. Net traffic to MP is one HTTP request per unique route ever viewed. Defensible for personal/hobby use; revisit MP's ToS before any public launch.
- **Open-Meteo provides past + forecast weather with no API key, no cost**, for both daily and hourly resolution.

## Scope

### v1 — In

- Route name search (paste URL deferred — search is the only entry point)
- Weather chart (temperature line + precipitation bars, 7 days back through 7 forward)
- Daily cards row, click to expand hourly
- Shareable deep links: `/route/<id>`
- Mobile-responsive layout
- Link back to Mountain Project for attribution

### v2 — Deferred

- Crag-name search
- Coordinate / map-pin search
- Custom date range picker
- User accounts / saved favorites
- Dew point, wind, humidity, sun cover

## Architecture

```
                        ┌────────────────────┐
                        │  GitHub Actions    │
                        │  (monthly cron)    │
                        │  sitemap → routes  │
                        └─────────┬──────────┘
                                  │ upsert
                                  ▼
┌─────────────┐   /api/search   ┌──────────────────┐
│  Browser    │ ──────────────▶ │  Vercel Postgres │
│  Next.js    │ ◀────────────── │  • routes        │
│  React UI   │                 │  • route_meta    │
└──────┬──────┘                 └────────┬─────────┘
       │ /api/route/[id]                 ▲
       │                                 │ cache write
       ▼                                 │
┌─────────────────────┐                  │
│  Next.js API route  │                  │
│  1. read meta       │──── miss ────────┤
│  2. scrape MP page  │                  │
│  3. fetch Open-Meteo│                  │
│  4. return combined │                  │
└─────────────────────┘                  │
       │                                 │
       ▼                                 │
   mountainproject.com (1× per route ever)
   open-meteo.com (every page view)
```

One Next.js app on Vercel. Two API routes, one Postgres database, one GitHub Actions cron.

## Components

### Frontend pages (Next.js App Router)

| Path | Purpose |
|---|---|
| `/` | Search box (autocomplete, 200ms debounce). Empty state shows ~6 hard-coded popular routes. |
| `/route/[id]` | Route detail: header (name, area, grade, MP link), Recharts chart, 14 daily cards, click-to-expand hourly. |
| `/about` | Data sources, attribution, ToS note. |

### Backend (`app/api/`)

| Route | Behavior |
|---|---|
| `GET /api/search?q=<text>` | Postgres trigram fuzzy search on `routes.name`, returns up to 20 matches: `{id, slug, name}`. |
| `GET /api/route/[id]` | Read `route_meta`. Cache hit (and not stale > 90 days) → use it. Miss → scrape MP, parse lat/lng + name + area, upsert. Update `routes.name` with canonical name. Then call Open-Meteo. Return combined `{route, weather}`. |

### Shared lib (`lib/`)

- `db.ts` — Postgres client (`@vercel/postgres`)
- `mp-scraper.ts` — `scrapeRoute(id) → {name, lat, lng, area, grade}`. Pure function. Most fragile component; gets dedicated unit tests.
- `weather.ts` — Open-Meteo fetch + response normalization
- `search.ts` — search query builder

### External job (`scripts/build-index.ts`)

- Runs in GitHub Actions monthly via `.github/workflows/index-routes.yml`
- Fetches sitemap index → 298 sub-sitemaps with 60s sleep between requests (~5 hours total)
- For each `/route/<id>/<slug>`: derive `name` (replace `-` with space, title-case), upsert into `routes`
- Logs counts; non-zero exit on hard failures

## Data flow

### Flow A — Search

```
user types "astroma"
  → debounce 200ms
  → GET /api/search?q=astroma
  → SELECT id, slug, name FROM routes
    WHERE name % 'astroma'
    ORDER BY similarity(name, 'astroma') DESC
    LIMIT 20
  → render dropdown
  → click → /route/[id]
```

### Flow B — Route detail

```
GET /route/105891858 (server component)
  → /api/route/105891858
      ├─ SELECT * FROM route_meta WHERE id = 105891858
      │
      ├─ HIT (fetched_at < 90 days):
      │     use cached {lat, lng, name, area, grade}
      │
      └─ MISS:
            fetch https://www.mountainproject.com/route/105891858
            parse Google-Maps anchor href for lat/lng
              fallback regex: (-?\d{1,3}\.\d{4,6}),\s*(-?\d{1,3}\.\d{4,6})
            extract name, area path, grade
            INSERT INTO route_meta (...) ON CONFLICT (id) DO UPDATE
            UPDATE routes SET name = $1 WHERE id = $2  -- canonical name upgrade
  → fetch Open-Meteo:
       /v1/forecast?latitude=&longitude=
         &past_days=7&forecast_days=7
         &daily=temperature_2m_max,temperature_2m_min,precipitation_sum
         &hourly=temperature_2m,precipitation
         &timezone=auto
  → return { route: {...}, weather: { daily: [...], hourly: [...] } }
  → page renders chart + cards
```

### Caching

- `route_meta` rows live indefinitely; refresh after 90 days as a safety re-check.
- Weather is **never cached server-side**. Browser-cached via `Cache-Control: public, max-age=600` on the API response.
- Failed scrapes are **not** negatively cached — MP could be transiently down.

### Why parse the Google-Maps anchor instead of JSON-LD

Verified at design time: MP route pages do not use JSON-LD. Coordinates appear as plain text and (likely) inside a `https://maps.google.com/?q=<lat>,<lng>` anchor. The anchor `href` is the most stable selector; the plain-text regex is a fallback. The scraper carries dedicated fixture-based unit tests so MP HTML changes break CI loudly.

## Data model

```sql
-- Search index. Populated by the monthly GH Actions job.
CREATE TABLE routes (
  id          BIGINT PRIMARY KEY,         -- MP route id
  slug        TEXT NOT NULL,              -- URL slug, e.g. "the-nose"
  name        TEXT NOT NULL,              -- derived from slug, upgraded by scraper
  indexed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX routes_name_trgm ON routes USING gin (name gin_trgm_ops);

-- Lazy cache of per-route metadata scraped from MP.
CREATE TABLE route_meta (
  id          BIGINT PRIMARY KEY REFERENCES routes(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  area_path   TEXT,
  grade       TEXT,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Notes:**
- `BIGINT` IDs for headroom (current MP IDs are 9–10 digits).
- `pg_trgm` GIN index makes 300k-row fuzzy search sub-50ms.
- ON DELETE CASCADE: stale routes dropped by the indexer also clear their cached meta.
- No weather table — weather is never persisted server-side.
- The scraper updates `routes.name` with the canonical name on cache miss, so the search index self-improves through normal use.

## Error handling

| Failure | Response |
|---|---|
| MP scrape fails (404, 5xx, parser miss) | `502` with `{error: "route_unavailable"}`; UI shows "Couldn't load this route — [View on MP →]". No negative caching. Log for parser-regression detection. |
| Open-Meteo fails / times out (5s) | Render route header anyway; inline "Weather unavailable, try again". Do not 500 the page. |
| Search returns nothing | Empty state with "browse on MP" link. Not an error. |
| Postgres unreachable | Standard 500. Vercel logs. |

**Edge cases:**
- Stale route ID in our index but deleted on MP → scrape 404 → handled above; next month's indexer drops the row.
- Parser regression → spike in failure logs → manual investigation. Fixture tests catch most cases at PR time.
- Bad parsed lat/lng → users will notice obvious wrongness ("forecast for Antarctica"); accepted risk.

## Testing

**Unit — `lib/mp-scraper.ts` (the fragile part):**
- 5–10 real MP route HTML pages saved to `tests/fixtures/mp/`, committed.
- Assert exact lat/lng/name/area/grade. Cover: with/without grades, nested vs. flat areas, unusual characters.

**Unit — `lib/weather.ts` and `lib/search.ts`:**
- Weather: mocked Open-Meteo response, assert normalized shape (daily length, hourly length, fields).
- Search: ephemeral test DB seeded with fixtures, assert trigram results for typos / partial / exact / no-match.

**Integration:**
- `/api/route/[id]` against fixture-backed route, MP and Open-Meteo mocked at network layer (MSW).
- `/api/search` against seeded DB.

**Indexer:**
- Unit test: feed fixture sitemap XML, assert parsed `{id, slug, name}` rows.
- No live end-to-end test (5+ hour runtime).

**Out of scope for v1:** E2E browser tests, visual regression, load testing.

**Tooling:** Vitest + MSW. Real Postgres in CI (Docker container or Neon branch-per-PR).

## Open questions for the implementation plan

- Migration framework choice (Prisma vs. Drizzle vs. raw SQL)
- Specific Recharts component layout (chart + cards row)
- GitHub Actions secrets + Vercel project linking flow
- Empty-state "popular routes" — which 6?
