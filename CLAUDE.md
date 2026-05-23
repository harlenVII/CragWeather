# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start Next.js dev server (localhost:3000)
npm run build        # production build
npm test             # run all tests (uses crag_test DB — never touches dev data)
npm run test:watch   # vitest in watch mode
npm run db:generate  # generate Drizzle migration from schema changes
npm run db:migrate   # apply migrations to the dev database (crag)
npm run db:migrate:test  # apply migrations to the test database (crag_test)
npm run db:seed      # seed dev database with a handful of popular routes
npm run index:routes # populate routes table from MP sitemap (~5+ hours)
```

Run a single test file:
```bash
npx vitest run tests/lib/mp-scraper.test.ts
```

Local Postgres (required for tests and dev):
```bash
docker compose up -d
```

**One-time test database setup** (run once after `docker compose up -d`):
```bash
docker compose exec postgres createdb -U crag crag_test
npm run db:migrate:test
```

Seed dev routes (The Nose + a few others):
```bash
npm run db:seed
```

## Architecture

CragWeather shows 14-day weather windows for rock climbing routes from Mountain Project (MP).

**Data flow:**

1. **Search** — `GET /api/search?q=...` uses PostgreSQL trigram similarity (`pg_trgm`) to fuzzy-match route names. The `routes` table is populated by `scripts/build-index.ts`, which crawls MP's sitemap (60s crawl-delay enforced).

2. **Route page** — `app/route/[id]/page.tsx` is a server component that calls its own `GET /api/route/[id]` endpoint. That endpoint:
   - Looks up the route in Postgres.
   - Checks `route_meta` for cached lat/lng/grade/area (90-day TTL). If stale or missing, scrapes the live MP page via `lib/mp-scraper.ts`.
   - Calls Open-Meteo for 7-day past + 7-day forecast weather at the route's coordinates.
   - Returns combined JSON; the page renders it with `WeatherChart` (Recharts) and `DailyCards`.

3. **Indexer** — `scripts/build-index.ts` runs weekly via GitHub Actions (Monday 07:00 UTC) using `POSTGRES_URL` and `MP_USER_AGENT` secrets. It upserts into `routes`; `route_meta` is populated lazily on first visit.

**Key files:**
- `lib/schema.ts` — two Drizzle tables: `routes` (id, slug, name) and `route_meta` (lat, lng, area, grade, 90-day cache)
- `lib/mp-scraper.ts` — `parseRoutePage` extracts coords from the onX Backcountry map link in MP's HTML; `scrapeRoute` fetches live
- `lib/weather.ts` — `fetchWeather(lat, lng)` calls Open-Meteo with a 10s timeout
- `lib/search.ts` — trigram similarity query using `%` operator
- `app/api/route/[id]/route.ts` — central orchestration: DB lookup → scrape if stale → weather fetch

**Testing:**
- Vitest with jsdom; MSW (`tests/mocks/`) intercepts HTTP calls to MP and Open-Meteo
- Tests use a separate `crag_test` database (configured via `.env.test`) so `truncateAll()` never touches dev data
- MP scraper tests use HTML fixtures in `tests/fixtures/mp/` — if MP changes its HTML, re-fetch these fixtures and update parsers
- Tests run serially (`fileParallelism: false`) because they share a real Postgres connection
- `@` alias resolves to the project root

**Environment variables:**
- `POSTGRES_URL` — connection string (default: `postgres://crag:crag@localhost:5432/crag`)
- `MP_USER_AGENT` — UA string sent to Mountain Project (required in production)

## Operator notes

- `route_meta` TTL is `NINETY_DAYS_MS` in `app/api/route/[id]/route.ts` — adjust there if needed.
- Do not lower the 60s crawl-delay in `scripts/build-index.ts` without re-reading MP's `robots.txt`.
- Always develop directly on `main` (no worktrees for this project).
