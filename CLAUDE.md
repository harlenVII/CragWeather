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

Pasting a Mountain Project URL into the search box navigates directly to that route's page without a DB lookup. A Mountain Project URL can also be passed as `?mp=<url>` on the home page for a server-side redirect (e.g. `/?mp=https://www.mountainproject.com/route/105748662/the-nose`).

**Shared lists (favorites sync):**

```
SyncModal → POST /api/list   { routes } → returns UUID → stored in localStorage `cw_list_id`
          → user shares /list/<uuid> (QR or URL)
recipient → app/list/[id]/page.tsx → ConfirmJoin → useFavorites.link(id, routes)
useFavorites toggle/remove → write-through PUT /api/list/[id] when `cw_list_id` is set
```

Favorites are localStorage-first (`cw_favorites`, max 50). Once a user creates or joins a shared list, `useFavorites` write-throughs every change to `/api/list/[id]`. **There is no auth on shared lists** — anyone with the UUID URL can read and overwrite the routes array. `lib/list-validation.ts` (`validateRoutesBody`) gates writes: max 50 entries, strict shape check on each `SavedRouteJson`.

## Key files

- `lib/weather.ts` — `fetchWeather`, `stitchModels`, `isNorthAmerica`; all weather logic lives here
- `lib/schema.ts` — three tables: `routes` (id, slug, name), `route_meta` (lat, lng, area, grade, 90-day cache), and `shared_lists` (UUID, jsonb routes, no auth)
- `lib/mp-scraper.ts` — `parseRoutePage` extracts coords from the onX Backcountry map link in MP's HTML
- `lib/sliceWeather.ts` — trims hourly/daily arrays to the user-selected day window (7/10/15)
- `lib/sitemap.ts` — sitemap helpers used by `scripts/build-index.ts`
- `lib/list-validation.ts` — `validateRoutesBody` gates `/api/list` writes (50-route cap, shape check)
- `app/api/route/[id]/route.ts` — orchestrates DB lookup → scrape-if-stale → weather fetch
- `app/api/list/route.ts` + `app/api/list/[id]/route.ts` — POST creates a shared list, GET/PUT read/overwrite by UUID
- `app/list/[id]/page.tsx` + `ConfirmJoin.tsx` — server-rendered join flow for a shared-list URL
- `scripts/build-index.ts` — weekly sitemap crawler; `route_meta` is populated lazily on first page visit
- `components/WeatherView.tsx` — day-window selector (7/10/15); persists choice to `cragweather_days` and slices weather before rendering the charts
- `components/ForecastChart.tsx` — hourly chart (today+) with model-section dividers; renders `WindPanel` below
- `components/WindPanel.tsx` — wind speed + gust sub-chart (teal); rendered below `ForecastChart` only, not history
- `components/WeatherChart.tsx` — daily chart used for the past-7-days history section
- `components/DailyCards.tsx` — scrollable day cards; model badge only shown for forecast days
- `components/SaveButton.tsx` — toggles a route in/out of `localStorage` favorites; rendered on route pages
- `components/SavedRoutes.tsx` — reads favorites from `localStorage` and renders them on the home page
- `components/SyncModal.tsx` — share/join UI for shared lists; renders the share URL as a QR via `qrcode.react`; Join mode has an in-app QR scanner via `QrScanner`
- `components/QrScanner.tsx` — thin wrapper around `@yudiel/react-qr-scanner` (dynamic-imported in `SyncModal` to keep ZXing out of the home bundle). Exposes `onDecode(text)` / `onError("denied"|"no-camera"|"other")`; classifies `IScannerError.kind` (not `.name`) internally
- `components/ServiceWorkerRegistration.tsx` + `public/sw.js` + `public/manifest.json` — registers the PWA service worker; icons in `public/`
- `lib/favorites.ts` — `useFavorites` hook; reads/writes `cw_favorites` (max 50) and `cw_list_id` in `localStorage`. When `cw_list_id` is set, toggle/remove write-through to `PUT /api/list/[id]`; exposes `createSyncedList`, `link`, `unlink`

## Multi-model weather stitching

For North American routes (`isNorthAmerica`: lat 7–84, lng –169 to –52), `fetchWeather` requests three models in a single Open-Meteo call and stitches them by priority:

| Priority | Model ID (Open-Meteo) | Label | Coverage |
|---|---|---|---|
| 1 | `ncep_hrrr_conus` | HRRR | ~48h, CONUS only |
| 2 | `ncep_nam_conus` | NAM | ~60-72h, North America |
| 3 | `gfs_global` | GFS | 16 days, global |

**Critical API behaviour:** Open-Meteo returns a **single JSON object with prefixed field names** (e.g. `temperature_2m_ncep_hrrr_conus`) when multiple models are requested — not an array. `fetchWeather` extracts each model's arrays and passes them as `OmHourlyResponse[]` to `stitchModels`.

**Stitching:** for each hourly slot, `stitchModels` walks HRRR → NAM → GFS and takes the first non-null `temperature_2m`. Wind speed and gust (`windSpeed`, `windGust`) are carried from the same winning model slot. Daily values (tempMax, tempMin, precip) are **derived from the stitched hourly entries** — never from Open-Meteo's pre-aggregated daily values, which can be inaccurate when a model's window cuts mid-day. `DailyWeather` carries no wind fields; wind is forecast-only and rendered hourly.

**Daily model badge:** shows every model that contributed at least one hour to that day, joined with " & " in priority order (e.g. "HRRR & NAM"). Badge only renders for dates ≥ today; history cards show no badge.

**ERA5 is intentionally excluded:** `era5_seamless` returns all-null values within the 7+7 day window (>7-day publication lag) so it was removed from the model list.

**Non-NA routes** use a standard single-model call (no `models` param) and show no badges.

**Wind units:** `fetchWeather` always requests `wind_speed_unit=ms` — both NA and non-NA. Open-Meteo defaults to km/h; the explicit param ensures m/s throughout.

## Testing

- Tests target `crag_test` database via `.env.test` (loaded in `vitest.config.ts` with `override: true`), so `truncateAll()` in `beforeEach` never touches dev data.
- Test layout: `tests/lib/` (pure functions, DB-backed), `tests/api/` (route handlers), `tests/components/` (React via Testing Library + jsdom), `tests/scripts/` (indexer), `tests/helpers/` (shared utilities), `tests/fixtures/` (HTML + JSON), `tests/mocks/` (MSW handlers).
- MSW (`tests/mocks/`) intercepts all HTTP — MP scraper tests use HTML fixtures in `tests/fixtures/mp/`.
- Multi-model Open-Meteo mocks must use the prefixed single-object format and include wind arrays (`wind_speed_10m_<model>`, `wind_gusts_10m_<model>`) — see `tests/lib/weather.test.ts` `multiFixture`.
- Tests run serially (`fileParallelism: false`) due to shared Postgres connection.
- `SyncModal` tests mock `next/navigation` (for `useRouter`) and `@/components/QrScanner` (to capture `onDecode`/`onError` callbacks without touching the real camera). Both mocks are hoisted at the top of `tests/components/SyncModal.test.tsx`.
- **Gotcha:** `window.isSecureContext` is `undefined` in jsdom, not `false`. Guard against insecure context using `=== false`, not `!`, to avoid false-positives in tests.

## Environment variables

- `POSTGRES_URL` — defaults to `postgres://crag:crag@localhost:5432/crag`
- `MP_USER_AGENT` — sent to Mountain Project; required in production

## Operator notes

- `route_meta` TTL: `NINETY_DAYS_MS` in `app/api/route/[id]/route.ts`
- Scraper drift: if MP changes its HTML, re-fetch `tests/fixtures/mp/*.html` and update `lib/mp-scraper.ts`
- Crawl delay: 60s in `scripts/build-index.ts` — do not lower without re-reading MP's `robots.txt`
- Indexer runs weekly (Monday 07:00 UTC) via GitHub Actions using `POSTGRES_URL` + `MP_USER_AGENT` secrets
- Always develop directly on `main` (no worktrees for this project)
- **QR scanner requires HTTPS.** `window.isSecureContext === false` on HTTP (e.g. local dev via `http://192.168.x.x:3000`); the library throws before `getUserMedia` is ever called so no camera permission prompt appears. Test the scanner on the deployed Vercel URL or via an HTTPS tunnel (e.g. ngrok).
