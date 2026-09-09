# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Next.js dev server (localhost:3000)
npm run build            # production build
npm run lint             # ESLint (next/core-web-vitals)
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

Pasting a Mountain Project URL into the search box navigates directly to that route's page without a DB lookup. A Mountain Project URL can also be passed as `?q=<url>` on the home page for a server-side redirect (e.g. `/?q=https://www.mountainproject.com/route/105748662/the-nose`).

MP also publishes `/v/<id>` short links. **The number in a `/v/` link is a generic object id — NOT the route id** (e.g. `/v/105748662` redirects to `/route/105748660/…`, and some `/v/` links point at forum posts or areas, not routes at all). `parseSearchTarget` classifies these as `{ kind: "mp-short", id }`; `SearchBox` / home `?q=` route them to `/v/<id>` (`app/v/[id]/page.tsx`), a server component that calls `resolveShortLink` (`lib/mp-scraper.ts`) to follow the redirect chain, extract the real route id from the final `/route/<id>` URL, and `redirect("/route/<realId>")`. If the link doesn't resolve to a route, the page `notFound()`s. This extra network hop only happens for `/v/` links; plain `/route/` URLs stay synchronous.

Entering GPS coordinates in the search box (decimal degrees like `37.734, -119.637`, DMS, or a pasted Google/Apple Maps URL) navigates to `/at/<lat>,<lng>` — a coordinate-only weather page with no MP backing. Raw typed coordinates surface as a "📍 Weather at …" dropdown row; pasted map URLs (and MP URLs) redirect immediately. `lib/parseCoords.ts` parses the formats; `lib/searchTarget.ts` (`parseSearchTarget`) classifies input as MP-route / coords / none and is shared by `SearchBox` and the home-page deep link. The home page accepts `?q=<url-or-coords>` for any recognized input; the old `?mp=` param is no longer supported.

**Shared lists (favorites sync):**

```
SyncModal → POST /api/list   { routes } → returns UUID → stored in localStorage `cw_list_id`
          → user shares /list/<uuid> (QR or URL)
recipient → app/list/[id]/page.tsx → ConfirmJoin → useFavorites.link(id, routes)
useFavorites toggle/remove → write-through PUT /api/list/[id] when `cw_list_id` is set
```

Favorites are localStorage-first (`cw_favorites`, max 50). Once a user creates or joins a shared list, `useFavorites` write-throughs every change to `/api/list/[id]`. **There is no auth on shared lists** — anyone with the UUID URL can read and overwrite the routes array. `lib/list-validation.ts` (`validateRoutesBody`) gates writes: max 50 entries, string fields capped at 200 chars, strict shape check on each `SavedRouteJson`.

`SavedRoute` (and the shared-list `SavedRouteJson`) is a discriminated union: MP routes are `{ kind?: "mp", id, name, area, grade }`; GPS locations are `{ kind: "gps", lat, lng, name }`. `routeKey(r)` (`mp:<id>` / `gps:<lat,lng>`) is the identity used for dedup, removal, and React keys — `isSaved`/`toggle`/`remove` all key on it. Entries with no `kind` are treated as MP (backward compatible). `validateRoutesBody` accepts either shape (GPS branch range-checks lat/lng).

## Key files

- `lib/weather.ts` — `fetchWeather`, `aggregateDaily`; all weather logic lives here. One request shape for every coordinate — see "Weather model" below
- `lib/db.ts` — the single Drizzle/`pg` pool. It **throws at import time** if `POSTGRES_URL` is unset, so any module importing it transitively needs the var present even in a test that never touches the DB. Separately, `vitest.config.ts` loads `.env.test` with `override: true` so that var points at `crag_test` — the two together are what keep `truncateAll()` off the dev database
- `lib/schema.ts` — three tables: `routes` (id, slug, name), `route_meta` (lat, lng, area, grade, 90-day cache), and `shared_lists` (UUID, jsonb routes, no auth)
- `lib/mp-scraper.ts` — `parseRoutePage` extracts coords from the onX Backcountry map link in MP's HTML; `resolveShortLink` follows a `/v/<id>` redirect chain and returns the real route id (or null)
- `lib/sliceWeather.ts` — trims hourly/daily arrays to the user-selected day window (7/10/15); also `localDayAndHour` (local-calendar `today` + `nowHour`) and the partial-today history entry
- `lib/weekendBands.ts` — `getWeekendBands(ticks, lastDatetime)`: the Sat/Sun ranges to shade, derived from the midnight day ticks. `WeekendBand` (`{start, end}`) is the shared band shape every panel takes
- `lib/nightBands.ts` — `getNightBands(daily, firstHour, lastHour)`: sunset→next sunrise ranges, built from the `daily` sun times rather than from the hours. **The x-axis is a category scale keyed on the hourly datetime strings, so a `ReferenceArea` boundary that is not itself one of those strings is discarded rather than interpolated** — "06:34" would simply not draw, hence `snapToHour`. Bands are therefore hour-resolution and the exact minutes live on the day cards. Days missing either value are skipped, so a polar day draws no night
- `lib/sitemap.ts` — sitemap helpers used by `scripts/build-index.ts`
- `lib/list-validation.ts` — `validateRoutesBody` gates `/api/list` writes (50-route cap, 200-char string cap, shape check)
- `app/api/route/[id]/route.ts` — orchestrates DB lookup → scrape-if-stale → weather fetch; falls back to stale `route_meta` if scrape fails
- `app/api/list/route.ts` + `app/api/list/[id]/route.ts` — POST creates a shared list, GET/PUT read/overwrite by UUID
- `app/list/[id]/page.tsx` + `ConfirmJoin.tsx` — server-rendered join flow for a shared-list URL
- `scripts/build-index.ts` — weekly sitemap crawler; `route_meta` is populated lazily on first page visit
- `components/WeatherView.tsx` — day-window selector (7/10/15); persists choice to `cragweather_days` and slices weather before rendering the charts. Derives `today`/`nowHour` via `localDayAndHour` and passes `nowHour` to both `sliceWeather` and `WeatherChart`
- `components/ForecastChart.tsx` — forecast stack **coordinator**: owns the single hover index, the tooltip strip, day ticks, weekend bands and model sections; renders six panels and the dew-point explainer. Holds no chart of its own
- `components/TempPanel.tsx` — panel 1 (260px): temp + feels-like on one °C axis, domain from `tempDomain`. It used to carry model labels and section dividers; with `best_match` there is no per-hour provenance to label, so all six panels now share the same `top: 8` margin
- `components/PrecipPanel.tsx` — panel 2 (150px): mm bars (left axis) + chance-of-precip line on a fixed 0–100 right axis, `connectNulls={false}`. The mm axis is floored at `MM_AXIS_FLOOR` (4mm) and auto-fits above it — without the floor a 0.1mm drizzle draws a full-height bar reading as a downpour, and the scale changes silently between crags and between the 7/10/15-day windows. Both axes exist to stop the panel rescaling out from under the reader
- `components/WindPanel.tsx` — panel 3 (150px): wind speed + gust (teal); forecast only, not history
- `components/DewPointPanel.tsx` — panel 4 (150px): dew point alone on a °C axis (domain from `dewPointDomain`), with horizontal `ReferenceArea` bands below `GOOD_MAX_C` (sky) and above `GREASY_MIN_C` (rose), followed by the dew-point explainer note. **Temperature is deliberately absent.** It used to be plotted alongside so the converging lines could be read as a condensation signal, but that reading is wrong: rock wets when its own *surface* falls below the dew point, which routinely happens with cold rock under warm humid air — air temperature far above the dew point and the holds still damp. The panel has no surface temperature, so it cannot show that; what it can support is the absolute dew point against the friction thresholds. Temperature is on panel 1, against the same x-axis, and in the hover strip. The bands are emitted **before** the grid and line — SVG has no z-index, so a band declared later would tint the series being traced. They use sky/rose rather than the weekend band's amber, since two amber tints crossing at right angles read as one shape. No `sections` prop: provenance is stated once, on panel 1
- `components/HumidityPanel.tsx` — panel 5 (150px): relative humidity on a fixed 0–100 axis
- `components/AirQualityPanel.tsx` — panel 6 (150px): US AQI on an axis floored at `AQI_AXIS_FLOOR` (100), against clamped EPA category bands, plus a grey `ReferenceArea` over the hours CAMS does not forecast. **It is the only panel that does not accept `weekendBands`** — the weekend band is amber, which on an AQI chart is the colour of "Unhealthy for sensitive groups", so an amber Saturday column reads as pollution. Accepting and ignoring the prop would be worse than omitting it. Bands are emitted before the grid and line (SVG has no z-index) and only where they intersect the domain, so a clean crag is a calm two-tone panel rather than a permanent rainbow
- `lib/aqiBands.ts` — `AQI_BANDS` (EPA breakpoints, contiguous so the rendered areas leave no gap), `aqiDomain`, `aqiCategory`, `visibleBands`, `lastCoveredIndex`, `formatAqiCutoff`. `aqiDomain` keeps zero as the lower bound — AQI is a ratio scale, unlike temperature — and floors the ceiling at 100 for the `MM_AXIS_FLOOR` reason: measured clean-air crags sit at 17–52, so an auto-fitted axis draws a "Good" day as a full-height line and the scale shifts between crags and between the 7/10/15-day windows. `formatAqiCutoff` reads the timestamp positionally, never via `new Date` (crag-local wall clock)
- `lib/airQuality.ts` — `fetchAirQuality`: the second Open-Meteo endpoint. See "Air quality" below
- `lib/tempDomain.ts` — `tempDomain(values)`: y-axis domain for the °C panels. Recharts anchors a numeric axis at 0 by default — and its `'auto'` lower bound does the same for all-positive data — which wasted the bottom third of the panel. Temperature is an interval scale, so zero is not a baseline; precipitation, wind and humidity keep theirs because zero means "none" there. Widens to `MIN_SPAN_C` (10°C) when the data is flatter, so a 12–14°C day does not stretch to look dramatic. Recharts' own per-bound domain functions cannot express this — each sees only its own bound, never the span. Also exports `dewPointDomain(values)`, which is `tempDomain` with the two friction thresholds folded in as extra anchors so the axis always spans at least 3–17°C. A `ReferenceArea` lying outside the domain is **discarded entirely** by Recharts, not clipped — without the anchors a cool 6–9°C crag would draw the good-friction band and silently drop the greasy one, and the bands would sit in a different place at every crag. The anchors only ever widen the range, so sub-zero dew points still extend the axis downward instead of being clipped
- `lib/dewPointBands.ts` — `GOOD_MAX_C` (5) and `GREASY_MIN_C` (15): the dew-point friction thresholds, in °C. Climbers' rules of thumb rather than physics ("under 40°F good, over 55–60°F greasy", rounded), and shared by three places that must agree — the reference bands, `dewPointDomain`, and the explainer note, which interpolates the constants rather than hardcoding the numbers in prose
- `lib/panelLayout.ts` — `LEFT_MARGIN`: shared left margin for all six panels. At `left: 0` the rotated `insideLeft` axis labels overhang the SVG boundary by ~4px and are clipped at every viewport width

Panels 1–5 share one props shape (`data`, `ticks`, `tickFormatter`, `weekendBands`, `onHover`, `onLeave`) so the history section can adopt them later without modification. `AirQualityPanel` shares it minus `weekendBands`, for the reason given above.

**Panel margins must match across the stack, on both sides.** `margin.left` comes from the shared `LEFT_MARGIN` constant; never set it per-panel. On the right:  `margin.right` must total 80 with any right-hand axis, because Recharts insets a chart's plot area by `margin.right` PLUS the width of any right-oriented `YAxis`. `PrecipPanel` is the only panel with one (48px), so it uses `margin.right: 32`; every other panel uses `80`. A panel that gets this wrong silently drifts out of horizontal register with the rest of the stack — bars and lines stop lining up with the day above them. `tests/components/panelAlignment.test.tsx` renders all six panels and compares their x-axis extents against each other to catch it.

- `components/WeatherChart.tsx` — daily chart used for the history section; renders a `partial` day at 45% bar opacity with a `*` tick suffix and a `.chart-note` caption naming the cutoff hour
- `components/DailyCards.tsx` — scrollable day cards. Takes no `today` prop: it existed only to gate the model badge, which is gone
- `components/SaveButton.tsx` — toggles a route in/out of `localStorage` favorites; rendered on route pages
- `components/SavedRoutes.tsx` — reads favorites from `localStorage` and renders them on the home page
- `components/GpsHeader.tsx` + `GpsTitle.tsx` — the `/at/<coords>` page title. `GpsHeader` owns the save state and passes it down as `override` so `GpsTitle` reflects a save/remove immediately; without it the title would only update on reload, since the name comes from the favorites entry
- `components/FetchedAt.tsx` — renders the fetch timestamp client-side in the viewer's locale and timezone. Deliberately a client component: formatting it on the server would bake in the server's timezone and mismatch the hydrated markup
- `components/SyncModal.tsx` — share/join UI for shared lists; renders the share URL as a QR via `qrcode.react`; Join mode has an in-app QR scanner via `QrScanner`
- `components/QrScanner.tsx` — thin wrapper around `@yudiel/react-qr-scanner` (dynamic-imported in `SyncModal` to keep ZXing out of the home bundle). Exposes `onDecode(text)` / `onError("denied"|"no-camera"|"other")`; classifies `IScannerError.kind` (not `.name`) internally
- `components/ServiceWorkerRegistration.tsx` + `public/sw.js` + `public/manifest.json` — registers the PWA service worker; icons in `public/`
- `lib/favorites.ts` — `useFavorites` hook; reads/writes `cw_favorites` (max 50) and `cw_list_id` in `localStorage`. When `cw_list_id` is set, toggle/remove write-through to `PUT /api/list/[id]`; exposes `createSyncedList`, `link`, `unlink`
- `lib/parseCoords.ts` — `parseCoords` (decimal/DMS/map-URL → `{lat,lng,source}`), `formatCoords` (display), `coordsPath` (URL/key)
- `lib/windy.ts` — `windyUrl(lat,lng)`: windy.com map link, coords rounded to 3 decimals (`https://www.windy.com/47.554/-121.550`)
- `components/WindyLink.tsx` — renders `windyUrl` as a plain anchor (no `"use client"`), so it works in both the route and GPS server components. Route/GPS pages only — deliberately not on home-page saved cards, which have no coords
- `lib/searchTarget.ts` — `parseSearchTarget`: MP `/route/` regex → MP `/v/` short-link regex → `parseCoords`; single source of truth for search-box + `?q=` routing. Returns `mp` / `mp-short` / `coords` / null
- `app/v/[id]/page.tsx` — resolves an MP `/v/<id>` short link to its real route via `resolveShortLink` (follows the redirect), then redirects to `/route/<realId>`; `notFound()` if it isn't a route
- `app/at/[coords]/page.tsx` — coordinate-only weather page; calls `fetchWeather(lat,lng)` directly (no DB/scrape), renders `WeatherView`

## Weather model

`fetchWeather` sends **no `models` param**, at every coordinate on earth. Open-Meteo's
default `best_match` is not a single model — it is a per-location walk from the
highest-resolution model covering the point, outward to regional and then global models.
Measured against the named models (mean absolute difference on temperature, and how many
hours are bit-for-bit identical):

| Crag | First ~48h | Then | Then |
|---|---|---|---|
| Peak District UK | `ukmo_uk_deterministic_2km` — 0.00 °C, 50/50 exact | `ukmo_global_10km` 0.24 °C | `ecmwf_ifs025` |
| Céüse FR (1809 m) | `dwd_icon_d2` 2.2 km — 0.02 °C, 45/48 exact | `dwd_icon_eu` 0.31 °C | `dwd_icon` → `gfs_seamless` |
| Flatanger NO | `metno_nordic` 1 km — 0.01 °C, 55/58 exact | `ecmwf_ifs025` 0.21 °C | — |
| Siurana ES / Kalymnos GR | `dwd_icon_eu` — 0.02 °C, 114/117 exact | `dwd_icon` | `ecmwf_ifs025` |
| CONUS (5 crags) | bit-for-bit `gfs_seamless` across **all 384 hours** | — | — |

**This replaced a hand-rolled HRRR → NAM → GFS stitcher**, which is the history most of
the surrounding code was shaped by. Two things forced the change:

*It crashed outside the CONUS nests.* Requesting a model list makes Open-Meteo **omit the
column** for any model with no data at that point, and **drop the prefixes entirely** when
fewer than two models have data — a flat `temperature_2m` instead of
`temperature_2m_gfs_seamless`. The extraction then indexed `undefined` and threw, so the
route page 500'd at Hawaii, Alaska, Yukon, Newfoundland, southern Mexico, the Caribbean and
Central America. All are inside the old `isNorthAmerica` box (lat 7–84, lng −169 to −52).
Viñales, Cuba was the sharpest case: HRRR and GFS present, NAM absent, so it rendered ~48
hours and threw the moment HRRR ran out.

*It bought almost nothing.* In CONUS `best_match` is bit-for-bit `gfs_seamless`, which is
itself HRRR for hours 0–48. The **only** hours whose values changed were the ~12-hour NAM
band (where HRRR has ended and NAM has not) — 3.1 % of the window, differing 2.37 °C mean /
6.60 °C max. Whether NAM was *better* there was never established; it was only different.

What was given up is real and was given up knowingly: **per-hour model provenance**. There
are no model badges on the day cards and no labelled sections or dividers on the temperature
panel, in any region. `best_match` does not report which model won an hour, so restoring
badges means going back to an explicit model list — and then handling absent columns.

**Daily values are derived from the hourly entries** (`aggregateDaily`), not read from
Open-Meteo's `daily` block, which is why `daily=sunrise,sunset` is all that is requested.
The two agree exactly (0.000 °C / 0.000 mm over 94 days at three crags), so this is about
having one rule rather than about accuracy: `partialToday` builds today's history entry from
hourly with the same max/min/sum rules, and today is rendered in both sections.

**Null hours are dropped, not carried.** `best_match` ends in a short null tail (3 hours at
Céüse, 2 at Kalymnos on a 768-slot window). Mapping every slot blindly — which the old
non-NA branch did — put `temp: null` into `hourly` and a NaN `tempMax` on the final day.
`fetchWeather` skips any slot with a null temperature, so a null tail costs a shortened day
instead.

**`precipChance` is `number | null`, never defaulted to `0`** — a rendered "0%" is a claim,
an absence is not. Probability runs out before temperature does: a single trailing run (28
hours at Céüse), with past and near-term hours fully populated.

**Today is aggregated twice, on purpose.** `aggregateDaily` builds one `daily` entry per
date from *all* that date's hourly slots, so today's entry spans elapsed hours plus the rest
of the day's forecast — correct for the forecast section, wrong for history. `sliceWeather`
therefore ignores it on the history side and derives a second entry via `partialToday`,
aggregating only hours `<= nowHour` (inclusive, so the current hour counts) with the same
max/min/sum rules. It is appended after the N completed days and flagged `partial: true`.
Today appears in both sections as a result: full-day forecast above, partial below.
`nowHour` is optional — omit it and history stops at yesterday as before.

**Never derive the day boundary from `toISOString()`.** Open-Meteo timestamps are crag-local
(`timezone=auto`), so `today` must come from local calendar parts — `localDayAndHour` in
`lib/sliceWeather.ts`. The UTC date rolls over during the evening in western timezones,
which shifts the whole forecast/history split by a day and makes `partialToday` scoop up
forecast hours. This is the viewer's local time, not the crag's; acceptable while the common
case is a US user viewing US crags.

**Wind units:** `fetchWeather` always requests `wind_speed_unit=ms`. Open-Meteo defaults to
km/h; the explicit param ensures m/s throughout. `DailyWeather` carries no wind fields; wind
is forecast-only and rendered hourly.

**If you ever restore an explicit model list**, two measured constraints apply. Every
high-resolution national model returns **zero** hours of `precipitation_probability` —
AROME, UKMO 2 km, `metno_nordic`, DMI, ARPEGE all supply none; only the ICON family and
ECMWF carry it, so probability has to be read positionally from one column rather than off
the winning model. And `meteofrance_arome_france_hd` (1.5 km) is the one model `best_match`
does *not* already use where it exists — it differs from `best_match` by 1.68 °C mean at
Céüse. Higher resolution is not the same as more accurate; that would need verification
against station observations before it is worth adopting.

## Air quality

`lib/airQuality.ts` calls a **second host** — `air-quality-api.open-meteo.com` — for
`us_aqi` only. It is deliberately isolated from `lib/weather.ts`: CAMS has no model-priority
walk to run and no per-hour provenance to badge, so it stays out of `fetchWeather`. The
result travels as a **sibling `air` field** beside `weather`, never folded into
`HourlyWeather`.

**It must never be able to break the weather page.** Both call sites fetch it concurrently
with the weather and catch each promise independently (`Promise.all` over already-caught
promises). A failure yields `air: null`, and `ForecastChart` then renders no panel, no cutoff
note and no explainer — not an empty 150px box.

**The forecast horizon is ~4.3–5.0 days, and `forecast_days` is capped at 7** (8 or more is
a `400`). Measured on 2026-09-08: Yosemite / Portland / LA reached 4.3 days, London 4.6,
Sydney 5.0. So the panel is blank for the last ~2.5 days of the 7-day window and roughly
two-thirds of the 15-day window. That gap is **drawn and captioned** as a dead zone rather
than left as an ambiguous blank.

**Nulls are a clean trailing tail** — verified across every variable, zero interior gaps —
so `connectNulls={false}` is the entire gap-handling requirement. Values are interpolated to
true hourly despite the global domain's 3-hourly native cadence, so a line reads correctly.

**AQ is never sliced.** `WeatherView` forwards `air` untouched and `ForecastChart` joins it
to the weather hours by exact `datetime` lookup. Both calls use `timezone=auto` at the same
coordinates, so the local wall-clock strings match hour for hour. Mapping over `hourly`
rather than over `air.hourly` is what makes the panel's x-axis identical by construction to
the five above it, and it means the day-window slice propagates for free. `lib/sliceWeather.ts`
is not involved.

**Resolution is ~45 km** (CAMS global; CAMS Europe is 11 km, blended by `domains=auto`).
That will not resolve a valley inversion or a single plume, so nearby crags read the same.
The explainer note under the panel states this — it is the honest caveat, not optional copy.

This doubles outbound Open-Meteo calls per page view and both hosts draw on the same
free-tier non-commercial allowance. The AQ call sits inside the existing
`Cache-Control: max-age=600` / `revalidate = 600`, already far tighter than CAMS' 12-hour
(global) / 24-hour (Europe) update cycle.

## Testing

- Tests target `crag_test` database via `.env.test` (loaded in `vitest.config.ts` with `override: true`), so `truncateAll()` in `beforeEach` never touches dev data.
- Test layout: `tests/lib/` (pure functions, DB-backed), `tests/api/` (route handlers), `tests/components/` (React via Testing Library + jsdom), `tests/scripts/` (indexer), `tests/helpers/` (shared utilities), `tests/fixtures/` (HTML + JSON), `tests/mocks/` (MSW handlers).
- MSW (`tests/mocks/`) intercepts all HTTP — MP scraper tests use HTML fixtures in `tests/fixtures/mp/`.
- Tests run serially (`fileParallelism: false`) due to shared Postgres connection.
- `SyncModal` tests mock `next/navigation` (for `useRouter`) and `@/components/QrScanner` (to capture `onDecode`/`onError` callbacks without touching the real camera). Both mocks are hoisted at the top of `tests/components/SyncModal.test.tsx`.
- `next/cache` (`unstable_cache`) must be mocked in component tests — it requires Next.js's incremental cache infrastructure which is absent in jsdom. Use `vi.mock("next/cache", () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn }))` as a pass-through.
- **Gotcha:** `window.isSecureContext` is `undefined` in jsdom, not `false`. Guard against insecure context using `=== false`, not `!`, to avoid false-positives in tests.
- Open-Meteo mocks use the **flat, unprefixed** response shape (`tests/fixtures/open-meteo.json`) — the only shape there is now that no `models` param is sent. Tests that mutate the fixture must deep-clone it first (`clone()` in `tests/lib/weather.test.ts`); the module-level fixture is shared across the file.
- **Gotcha: Recharts renders nothing in jsdom.** `ResponsiveContainer` measures 0×0, so the legend, lines, bars and axes never reach the DOM — and wrapping the component in a sized `<div>` does not help. To assert on chart internals, hoist a `vi.mock("recharts", ...)` that replaces `ResponsiveContainer` with one given an explicit `width`/`height` (see `tests/components/TempPanel.test.tsx`). Without it a test can only assert on markup rendered *outside* the container, which is why `WeatherChart.test.tsx` only checks its caption. Note axis ticks are shared text: `getByText("0")` matches several elements, `getByText("100")` is unique.
- MSW's default handlers cover `air-quality-api.open-meteo.com` as well as `api.open-meteo.com` — they are separate hosts, so a suite that only overrides the forecast host still needs the air-quality default to avoid a live call.
- `GpsWeatherPage` tests mock `@/lib/airQuality` alongside `@/lib/weather`, both hoisted, since that page calls `fetchWeather`/`fetchAirQuality` directly. `RoutePage` tests stub global `fetch` instead — `app/route/[id]/page.tsx` fetches from the internal `/api/route/[id]` endpoint rather than calling those libs itself; `tests/api/route.test.ts` covers that endpoint's own `fetchWeather`/`fetchAirQuality` calls via MSW, not `vi.mock`.

## Environment variables

- `POSTGRES_URL` — defaults to `postgres://crag:crag@localhost:5432/crag`
- `MP_USER_AGENT` — sent to Mountain Project; required in production

## Operator notes

- `route_meta` TTL: `NINETY_DAYS_MS` in `app/api/route/[id]/route.ts`. On TTL expiry, if the live scrape fails but a stale row exists, the API falls back to the old coords rather than returning 502 — the row is only refreshed on a successful scrape.
- Scraper drift: if MP changes its HTML, re-fetch `tests/fixtures/mp/*.html` and update `lib/mp-scraper.ts`
- Crawl delay: 60s in `scripts/build-index.ts` — do not lower without re-reading MP's `robots.txt`
- Indexer runs weekly (Monday 07:00 UTC) via GitHub Actions using `POSTGRES_URL` + `MP_USER_AGENT` secrets
- Always develop directly on `main` (no worktrees for this project)
- **QR scanner requires HTTPS.** `window.isSecureContext === false` on HTTP (e.g. local dev via `http://192.168.x.x:3000`); the library throws before `getUserMedia` is ever called so no camera permission prompt appears. Test the scanner on the deployed Vercel URL or via an HTTPS tunnel (e.g. ngrok).
