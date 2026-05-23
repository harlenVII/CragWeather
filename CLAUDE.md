# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Next.js dev server (localhost:3000)
npm run build            # production build
npm test                 # run all tests against crag_test DB
npm run test:watch       # vitest watch mode
npm run db:generate      # generate Drizzle migration from schema changes
npm run db:migrate       # apply migrations to dev database (crag)
npm run db:migrate:test  # apply migrations to test database (crag_test)
npm run db:seed          # insert a handful of popular routes into dev DB
npm run index:routes     # crawl MP sitemap and populate routes (~5+ hours)
```

Run a single test file:
```bash
npx vitest run tests/lib/weather.test.ts
```

Local Postgres (required for tests and dev):
```bash
docker compose up -d
```

**One-time test database setup** (run once after first `docker compose up -d`):
```bash
docker compose exec postgres createdb -U crag crag_test
npm run db:migrate:test
```

## Architecture

CragWeather shows 14-day weather windows for rock climbing routes sourced from Mountain Project (MP).

**Request flow for a route page:**

```
browser → app/route/[id]/page.tsx (server component)
        → GET /api/route/[id]  (app/api/route/[id]/route.ts)
            → DB: routes table lookup
            → DB: route_meta lookup (lat/lng/grade/area, 90-day TTL)
                → if stale/missing: lib/mp-scraper.ts scrapes live MP page
            → lib/weather.ts fetchWeather(lat, lng)
                → Open-Meteo /v1/forecast
            → returns { route, weather } JSON
        → renders WeatherChart (history) + ForecastChart (forecast) + DailyCards
```

**Search flow:**

```
SearchBox (client) → GET /api/search?q=...
                   → lib/search.ts: pg_trgm similarity query across routes + LEFT JOIN route_meta
                   → returns id, slug, name, areaPath, grade
```

Pasting a Mountain Project URL into the search box navigates directly to that route's page without a DB lookup.

## Key files

- `lib/weather.ts` — `fetchWeather`, `stitchModels`, `isNorthAmerica`; all weather logic lives here
- `lib/schema.ts` — two tables: `routes` (id, slug, name) and `route_meta` (lat, lng, area, grade, 90-day cache)
- `lib/mp-scraper.ts` — `parseRoutePage` extracts coords from the onX Backcountry map link in MP's HTML
- `app/api/route/[id]/route.ts` — orchestrates DB lookup → scrape-if-stale → weather fetch
- `scripts/build-index.ts` — weekly sitemap crawler; `route_meta` is populated lazily on first page visit
- `components/ForecastChart.tsx` — hourly chart (today+) with model-section dividers
- `components/WeatherChart.tsx` — daily chart used for the past-7-days history section
- `components/DailyCards.tsx` — scrollable day cards; model badge only shown for forecast days

## Multi-model weather stitching

For North American routes (`isNorthAmerica`: lat 7–84, lng –169 to –52), `fetchWeather` requests three models in a single Open-Meteo call and stitches them by priority:

| Priority | Model ID (Open-Meteo) | Label | Coverage |
|---|---|---|---|
| 1 | `ncep_hrrr_conus` | HRRR | ~48h, CONUS only |
| 2 | `ncep_nam_conus` | NAM | ~60-72h, North America |
| 3 | `gfs_global` | GFS | 16 days, global |

**Critical API behaviour:** Open-Meteo returns a **single JSON object with prefixed field names** (e.g. `temperature_2m_ncep_hrrr_conus`) when multiple models are requested — not an array. `fetchWeather` extracts each model's arrays and passes them as `OmHourlyResponse[]` to `stitchModels`.

**Stitching:** for each hourly slot, `stitchModels` walks HRRR → NAM → GFS and takes the first non-null `temperature_2m`. Daily values (tempMax, tempMin, precip) are **derived from the stitched hourly entries** — never from Open-Meteo's pre-aggregated daily values, which can be inaccurate when a model's window cuts mid-day.

**Daily model badge:** shows every model that contributed at least one hour to that day, joined with " & " in priority order (e.g. "HRRR & NAM"). Badge only renders for dates ≥ today; history cards show no badge.

**ERA5 is intentionally excluded:** `era5_seamless` returns all-null values within the 7+7 day window (>7-day publication lag) so it was removed from the model list.

**Non-NA routes** use a standard single-model call (no `models` param) and show no badges.

## Testing

- Tests target `crag_test` database via `.env.test` (loaded in `vitest.config.ts` with `override: true`), so `truncateAll()` in `beforeEach` never touches dev data.
- MSW (`tests/mocks/`) intercepts all HTTP — MP scraper tests use HTML fixtures in `tests/fixtures/mp/`.
- Multi-model Open-Meteo mocks must use the prefixed single-object format (see `tests/lib/weather.test.ts` `multiFixture`).
- Tests run serially (`fileParallelism: false`) due to shared Postgres connection.

## Environment variables

- `POSTGRES_URL` — defaults to `postgres://crag:crag@localhost:5432/crag`
- `MP_USER_AGENT` — sent to Mountain Project; required in production

## Operator notes

- `route_meta` TTL: `NINETY_DAYS_MS` in `app/api/route/[id]/route.ts`
- Scraper drift: if MP changes its HTML, re-fetch `tests/fixtures/mp/*.html` and update `lib/mp-scraper.ts`
- Crawl delay: 60s in `scripts/build-index.ts` — do not lower without re-reading MP's `robots.txt`
- Indexer runs weekly (Monday 07:00 UTC) via GitHub Actions using `POSTGRES_URL` + `MP_USER_AGENT` secrets
- Always develop directly on `main` (no worktrees for this project)
