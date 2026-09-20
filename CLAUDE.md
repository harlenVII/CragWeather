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
- `components/ForecastChart.tsx` — forecast stack **coordinator**. Its AQI readout cell is a **chip** — EPA hue as the background, `--aqi-ink-dark`/`--aqi-ink-light` as the text, picked by the band's `ink` field — not coloured text: as text the EPA hues measured 1.43:1 (Hazardous on dark) and 1.02:1 (Moderate on light) against `--bg-2`, so the two most urgent categories were the least readable. Inverted, every category clears 5.25:1 in both themes. The chip sets **no font-weight** — at 600 its digits read as a larger font than the rest of the strip even though every value in there is the same 13px Inter; the fill carries the emphasis on its own. It owns the single hover index, the sticky `.chart-readout` strip, the `ChartCrosshair` overlay, day ticks, weekend/night bands, and a `PanelLabel` above each panel; renders six panels and the dew-point/air-quality explainer notes. Holds no chart of its own. **The readout strip reserves its own height.** The values row is always
in the DOM — em-dashes stand in for the values while nothing is hovered, and the
idle hint is stacked on top of it in the same one-cell grid rather than replacing
it. Swapping the row for the one-line hint sized the strip to whichever was
showing: one row idle, two or more on hover, so the whole chart stack jumped down
by a row the moment the pointer entered it (measured 916px of readout content
width at every viewport ≥1024, where ten cells need two rows; 5 rows at 375px).
For the same reason no cell is ever dropped: a null probability or an AQI hour
past the CAMS cutoff renders a dash, and the missing AQI value renders an *empty
chip* rather than a bare dash, since the chip's 0.05rem vertical padding is 1.6px
of the strip's height. The only cell that legitimately comes and goes is AQI as a
whole, keyed on `showAqi`, which is constant for the page. `.chart-readout__cell`
is a **fixed** width, not a minimum, so the row's wrap count depends only on how
many cells there are, never on how many digits a value has (`chance 3% → 100%`
re-wrapped the row mid-hover). The cost is a tall empty strip before first hover
on a phone; `tests/components/forecastChartProps.test.tsx` pins the cell count
idle-vs-hovered, since jsdom cannot measure the height itself
- `components/TempPanel.tsx` — panel 1 (220px): temp + feels-like on one °C axis, domain from `tempDomain`. It used to carry model labels and section dividers; with `best_match` there is no per-hour provenance to label, so all six panels now share the same `top: 8` margin. It also carries no Recharts `<Legend/>` — none of the six do; see "Frontend design system" below for `PanelLabel`
- `components/PrecipPanel.tsx` — panel 2 (130px): mm bars (left axis) + chance-of-precip line on a fixed 0–100 right axis, `connectNulls={false}`. The mm axis is floored at `MM_AXIS_FLOOR` (4mm) and auto-fits above it — without the floor a 0.1mm drizzle draws a full-height bar reading as a downpour, and the scale changes silently between crags and between the 7/10/15-day windows. Both axes exist to stop the panel rescaling out from under the reader
- `components/WindPanel.tsx` — panel 3 (130px): wind speed + gust (teal); forecast only, not history
- `components/DewPointPanel.tsx` — panel 4 (130px): dew point alone on a °C axis (domain from `dewPointDomain`), with horizontal `ReferenceArea` bands below `GOOD_MAX_C` (sky) and above `GREASY_MIN_C` (rose), followed by the dew-point explainer note. **Temperature is deliberately absent.** It used to be plotted alongside so the converging lines could be read as a condensation signal, but that reading is wrong: rock wets when its own *surface* falls below the dew point, which routinely happens with cold rock under warm humid air — air temperature far above the dew point and the holds still damp. The panel has no surface temperature, so it cannot show that; what it can support is the absolute dew point against the friction thresholds. Temperature is on panel 1, against the same x-axis, and in the hover strip. The bands are emitted **before** the grid and line — SVG has no z-index, so a band declared later would tint the series being traced. They use sky/rose rather than the weekend band's amber, since two amber tints crossing at right angles read as one shape. No `sections` prop: provenance is stated once, on panel 1
- `components/HumidityPanel.tsx` — panel 5 (130px): relative humidity on a fixed 0–100 axis
- `components/AirQualityPanel.tsx` — panel 6 (130px): US AQI on an axis floored at `AQI_AXIS_FLOOR` (100), against clamped EPA category bands, plus a grey `ReferenceArea` over the hours CAMS does not forecast. **It is the only panel that does not accept `weekendBands`** — the weekend band is amber, which on an AQI chart is the colour of "Unhealthy for sensitive groups", so an amber Saturday column reads as pollution. Accepting and ignoring the prop would be worse than omitting it. Bands are emitted before the grid and line (SVG has no z-index) and only where they intersect the domain, so a clean crag is a calm two-tone panel rather than a permanent rainbow
- `lib/aqiBands.ts` — `AQI_BANDS` (EPA breakpoints, contiguous so the rendered areas leave no gap; each band also carries `ink: "dark" | "light"` — not a colour, but which of the two theme-invariant `--aqi-ink-*` tokens is legible on that band's `fill`, used by the hover readout's AQI chip), `aqiDomain`, `aqiCategory`, `visibleBands`, `lastCoveredIndex`, `formatAqiCutoff`. `aqiDomain` keeps zero as the lower bound — AQI is a ratio scale, unlike temperature — and floors the ceiling at 100 for the `MM_AXIS_FLOOR` reason: measured clean-air crags sit at 17–52, so an auto-fitted axis draws a "Good" day as a full-height line and the scale shifts between crags and between the 7/10/15-day windows. `formatAqiCutoff` reads the timestamp positionally, never via `new Date` (crag-local wall clock)
- `lib/airQuality.ts` — `fetchAirQuality`: the second Open-Meteo endpoint. See "Air quality" below
- `lib/tempDomain.ts` — `tempDomain(values)`: y-axis domain for the °C panels. Recharts anchors a numeric axis at 0 by default — and its `'auto'` lower bound does the same for all-positive data — which wasted the bottom third of the panel. Temperature is an interval scale, so zero is not a baseline; precipitation, wind and humidity keep theirs because zero means "none" there. Widens to `MIN_SPAN_C` (10°C) when the data is flatter, so a 12–14°C day does not stretch to look dramatic. Recharts' own per-bound domain functions cannot express this — each sees only its own bound, never the span. Also exports `dewPointDomain(values)`, which is `tempDomain` with the two friction thresholds folded in as extra anchors so the axis always spans at least 3–17°C. A `ReferenceArea` lying outside the domain is **discarded entirely** by Recharts, not clipped — without the anchors a cool 6–9°C crag would draw the good-friction band and silently drop the greasy one, and the bands would sit in a different place at every crag. The anchors only ever widen the range, so sub-zero dew points still extend the axis downward instead of being clipped
- `lib/dewPointBands.ts` — `GOOD_MAX_C` (5) and `GREASY_MIN_C` (15): the dew-point friction thresholds, in °C. Climbers' rules of thumb rather than physics ("under 40°F good, over 55–60°F greasy", rounded), and shared by three places that must agree — the reference bands, `dewPointDomain`, and the explainer note, which interpolates the constants rather than hardcoding the numbers in prose
- `lib/panelLayout.ts` — `LEFT_MARGIN`: shared left margin for all six panels. At `left: 0` the rotated `insideLeft` axis labels overhang the SVG boundary by ~4px and are clipped at every viewport width

Panels 1–5 share one props shape (`data`, `ticks`, `tickFormatter`, `weekendBands`, `onHover`, `onLeave`) so the history section can adopt them later without modification. `AirQualityPanel` shares it minus `weekendBands`, for the reason given above.

**Panel margins must match across the stack, on both sides.** `margin.left` comes from the shared `LEFT_MARGIN` constant; never set it per-panel. On the right:  `margin.right` must total 80 with any right-hand axis, because Recharts insets a chart's plot area by `margin.right` PLUS the width of any right-oriented `YAxis`. `PrecipPanel` is the only panel with one (48px), so it uses `margin.right: 32`; every other panel uses `80`. A panel that gets this wrong silently drifts out of horizontal register with the rest of the stack — bars and lines stop lining up with the day above them. `tests/components/panelAlignment.test.tsx` renders all six panels and compares their x-axis extents against each other to catch it.

- `components/WeatherChart.tsx` — daily chart used for the history section; renders a `partial` day at 45% bar opacity with a `*` tick suffix and a `.chart-note` caption naming the cutoff hour. Legend-free like the forecast panels, but its `Tooltip` is a live hover rather than suppressed, which is why it alone also passes `SERIES_VAR` — see "Frontend design system" below
- `components/DailyCards.tsx` — scrollable day cards. Takes no `today` prop: it existed only to gate the model badge, which is gone
- `components/SaveButton.tsx` — toggles a route in/out of `localStorage` favorites; rendered on route pages
- `components/SavedRoutes.tsx` — reads favorites from `localStorage` and renders them on the home page
- `components/AppHeader.tsx` — sticky header mounted once in `app/layout.tsx`, present on every page. Search is omitted on `/` since the home page's hero search is already the entry point there; everywhere else it's the only way to reach another route without leaving the page — it replaced the old per-page "← Search another route" footer link. Carries `ThemeToggle`. Its height is `--header-h`, the same token `.chart-readout` consumes for its sticky offset — see "Frontend design system" below
- `components/RouteHeader.tsx` — shared layout shell (title, chips, actions, optional children) for the route and GPS page headers. No `"use client"` and no hooks, deliberately: `app/route/[id]/page.tsx` renders it from a server component and `GpsHeader` renders it from a client one, so it can't commit to either. Chips are filtered to drop null/blank entries before rendering, so a missing `area` or `grade` renders no chip rather than an empty one — `route_meta` is lazily populated (see above), so null is the common case, not the exception
- `components/GpsHeader.tsx` + `GpsTitle.tsx` — the `/at/<coords>` page title, composed inside `RouteHeader`. `GpsHeader` owns the save state and passes it down as `override` so `GpsTitle` reflects a save/remove immediately; without it the title would only update on reload, since the name comes from the favorites entry
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
- `components/ThemeToggle.tsx` — the theme toggle button; see "Frontend design system" below for the dark-default rule it shares with `app/layout.tsx`'s pre-paint script
- `components/PanelLabel.tsx` — replaces every Recharts `<Legend/>` across the forecast panels and `WeatherChart`; see "Frontend design system" below
- `components/ChartCrosshair.tsx` — the single hover line drawn across the whole forecast stack; see "Frontend design system" below
- `lib/chartColors.ts` — `SERIES` / `BANDS` / `AQI_BAND_CLASS` / `SERIES_VAR` / `READOUT`: the class names (and the one `var()` export) chart components theme themselves with; see "Frontend design system" below
- `lib/fonts.ts` — self-hosts Inter via `next/font/local` rather than requesting Google Fonts, so there's no extra request and no layout shift; `display: swap` plus next/font's automatic size-adjust fallback keeps first paint readable without reflow once the file lands
- `app/styles/tokens.css` + `base.css` + `components.css` — the three files `app/globals.css` imports, in cascade order: tokens (raw colors — the only file allowed to define one), global element resets plus the `.tnum` utility class, then every component rule. See "Frontend design system" below for the token layer and theming rules

## Frontend design system

`app/styles/tokens.css` is the only place a raw color may be defined. The
documented exceptions: `lib/aqiBands.ts` (the six EPA AQI hues, fixed by the
standard, not by theme), the single `theme-color` `<meta>` in `app/layout.tsx`
(read by OS chrome before any stylesheet loads, so it can't reference a
variable), and `.sync-modal__qr svg`'s `background: white` (a QR code needs
an opaque white quiet zone to scan in either theme). `app/globals.css` is
three `@import`s (`tokens.css`, `base.css`, `components.css`) and defines
nothing itself.

**Dark is `:root`; light is `[data-theme="light"]`.** The default is dark
regardless of `prefers-color-scheme` — the dark instrument look is the
design, and the toggle is how a reader opts out of it, not a system
preference the app should defer to. The rule is written **twice**, and both
copies must agree: `ThemeToggle.readTheme()` (the toggle's own state on
mount) and the inline `<script>` in `app/layout.tsx`'s `<head>` (first paint,
before React runs at all). The script must stay inline and synchronous — a
deferred script runs after the first paint, which is the one frame it exists
to control. Because an unset `[data-theme]` attribute already paints dark,
the flash the script actually prevents is **dark → light**, for a reader who
has previously chosen light: without it, their page paints dark for one
frame and then snaps to their stored choice once React reads `localStorage`.

**Every theme block must declare `color-scheme`** — `dark` on `:root`, `light`
on `:root[data-theme="light"]`. It is not decoration: it tells the UA which
palette *its own* colors belong to. Without it every UA system color resolves
light while the page paints dark, and four controls shipped that way —
"Sync to another device", the two sync-modal choices, the modal's "Join" button
and the search field all rendered `rgb(0,0,0)` text (`buttontext` / `fieldtext`)
on `#0b0f14`/`#141a21`, measured at 1.09:1 to 1.20:1. It also governs the
scrollbars on `.chart-scroll` / `.cards-row` / `.hourly-list` /
`.searchbox-results`, the text caret, the search field's clear ✕ and the UA's
default focus outline, none of which any stylesheet rule can reach. Belt and
braces: **every `input`/`button`/`select`/`textarea` rule states its own
`color`** (a token, `inherit`, or `currentColor` where the border follows it)
rather than leaving it to the UA, so a control stays legible even if something
overrides the scheme.

**And every such rule states `font: inherit`, before any `font-size`.** The UA
gives form controls 13.33px Arial, not the inherited font; the shorthand is what
overrides the family, and because it also resets `font-size`, a `font-size`
declared *before* it is silently thrown away. `.searchbox input` — the home
page's most prominent control — was rendering in Arial for exactly this reason,
alongside `.saved-sync-actions button`, `.saved-card-remove` and
`.confirm-join__actions button`.

The `theme-color` `<meta>` is **one tag, not a `prefers-color-scheme` pair**:
the OS preference does not drive this app's theme, so a media-keyed pair told an
OS-light reader on the dark default the wrong browser-bar colour. `ThemeToggle`
rewrites its `content` on mount and on every flip by reading `--bg-0` off the
document, which is why the literal in `app/layout.tsx` only has to be right for
the dark default.

The toggle button renders **both** glyphs into the DOM at all times; CSS,
driven by the `[data-theme]` attribute the pre-paint script already set,
picks which one shows. It used to pick the glyph from React state instead,
which meant the server render and the first client paint always showed the
dark-state glyph — a visible flash for every light-theme reader, on every
load, the same class of bug the pre-paint script exists to stop for the page
background.

`lib/chartColors.ts` exports **CSS class names** (`SERIES`, `BANDS`,
`AQI_BAND_CLASS`), not colors. Recharts takes its colors as component props,
and a prop can't hold a variable that changes with the theme — so a panel
carries a class instead, and a rule in `components.css` does the painting.
This is what lets the six `React.memo`'d panels theme themselves with no
theme prop and no re-render when the theme flips.

**Where Recharts puts that `className` differs by component, and the CSS
selectors have to match.** `Line` and `ReferenceArea` forward it only to the
wrapping `<g>`, so a rule needs a descendant selector to reach the element
that actually paints — `.series-temp path`, `.band-night
.recharts-reference-area-rect`. `Bar` forwards it to the wrapper *and* to
each bar shape too (rendered as `<path class="recharts-rectangle">`, not an
SVG `<rect>`), so a bare `.series-precip` rule is enough there.
`tests/components/rechartsClassName.test.tsx` pins this per component type;
a selector built on the wrong shape paints nothing, silently, rather than
erroring.

Band alpha is baked into the `--band-*` tokens, and every band rule adds
`fill-opacity: 1` on top — Recharts' `ReferenceArea` emits its own
`fill-opacity: 0.5` as a presentation attribute regardless, which would
otherwise multiply with the alpha already in the token (night's intended
0.45 rendering as 0.225). Any future band needs the same override. The EPA
AQI bands are the one exception: their hues are fixed by the standard and
stay on the `fill` prop, and only their alpha is themed, through the
`.aqi-band` class (`--aqi-band-opacity`).

`ChartCrosshair` is a DOM overlay, not a Recharts `<ReferenceLine>`, because
the six panels are memoized for a measured reason: before it, every
`mousemove` re-rendered ~2,000 SVG nodes across the stack (frame p50 94ms, 58
long tasks on a 15-day window); after, 17ms and zero. A `<ReferenceLine>`
would need a per-hover `x` prop on every panel, undoing exactly that fix.
The crosshair instead measures one panel's rendered x-axis and reuses that
extent for all six — valid only because
`tests/components/panelAlignment.test.tsx` pins all six panels' x-axis
extents equal, which makes that test load-bearing for the crosshair now, not
merely a layout check. `tests/components/forecastChartProps.test.tsx` is the
other half of the guard: it fires a real hover and asserts no panel prop
changes identity, i.e. that the memoization is still doing its job.

A caveat the crosshair's math has to carry: the six panels don't all share
one Recharts scale. `PrecipPanel` and `WindPanel` contain a `<Bar>`, so
Recharts gives them a band scale, where hour `i` sits at the centre of its
band; the other four get a point scale, where hour `i` sits at the edge. The
two agree mid-window and differ by at most half a band at the first and last
hour — about 2.4px at the real 7/10/15-day windows, invisible. **If a short
window (24-48h) is ever added, that gap widens to ~13px and becomes
visible**, and `panelAlignment.test.tsx` would not catch it, since it
compares extents, not where a given hour sits inside them. The fix then is
an explicit `scale="band"` on the four bar-less panels' `XAxis`.

`PanelLabel` is `position: sticky; left: 0` **plus `max-width: 100cqw`**, and
the cap is the load-bearing half. `.chart-inner` is `min-width: 700px`, so
without it the label was 700px wide inside a 700px containing block and sticky
had zero room to move: measured at 375px with `.chart-scroll` scrolled 391px,
the title's left edge sat at x = −350, entirely off screen, while `.chart-note`
(which has the cap) was correctly stuck at x = 33. `100cqw` is `.chart-scroll`'s
own visible width — it declares `container-type: inline-size` — with a
`calc(100vw - 4rem)` fallback, exactly as `.chart-note` does it; **keep the two
rules in step.** The right-aligned series keys then need a second rule: below a
340px strip the label switches to `justify-content: flex-start` via a
`@container` query, because the six labels are not the same width and at 375px
Temperature and Precipitation wrapped their keys onto a second line while Wind
stayed inline and right-aligned — three panels in one column disagreeing about
where their keys live. 340px is where the widest label (Temperature: title
100px + keys 184px + gap + padding = 312px) stops wrapping; measured, nothing
wraps at or above it and the desktop layout is unchanged.

`PanelLabel` replaced every Recharts `<Legend/>` — the app is legend-free,
including `WeatherChart`. Its series `name` strings are a frozen test
contract, enforced in `tests/components/ForecastChart.test.tsx`, which
asserts every name from every panel renders exactly once through
`ForecastChart` itself; the individual panel tests render each chart
directly, without that wrapper, so they no longer check these strings at all
and assert curve/bar counts instead, since the panel itself owns no text to
read. Removing the legend also cost Recharts its own source of color for
tooltip entries, which is why `WeatherChart` alone also passes `SERIES_VAR`
(`var()` strings, not classes) alongside its class: its `Tooltip` is a live
hover rendered as an HTML span, where `var()` resolves normally in an inline
style — unlike in an SVG presentation attribute fed through a Recharts prop.
The forecast panels don't need this, since their own `Tooltip` is suppressed
(`content={() => null}`) in favor of the single `.chart-readout` strip.

**The raised-surface block paints the element that IS the card, never its
wrapper.** `.saved-card` (the `<li>`) was added to it even though
`.saved-card-link` (the `<a>` inside) already takes the full card treatment from
`.home-popular li a`; the result was a square `border-radius: 0` border drawn
flush around a rounded 8px card, corners protruding, in both themes. Before
adding a selector there, check whether a descendant already carries it.

`--card-highlight` is `inset 0 0 0 transparent` on light, not `none`, because
`.card.card-open` composes it with the focus ring (`box-shadow: var(--ring),
var(--card-highlight)`) and `none` is not a legal item in a shadow list — the
whole declaration would be invalid and the open-card ring would disappear on
light. Any rule that replaces a raised surface's `box-shadow` has to re-list
`--card-highlight`, since it overrides the block wholesale: listing only the
ring dropped the inset highlight from the one card in the row meant to read as
most raised.

`--header-h` is the single source for both the app header's height and the
sticky `.chart-readout`'s `top` offset — one token instead of two literals
that would otherwise have to agree by coincidence.

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
note and no explainer — not an empty 130px box.

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

### Checking rendered CSS without Playwright

**jsdom applies no stylesheets**, so no vitest test can see a colour, a contrast
ratio, or a sticky element's real position. That blind spot is not theoretical: the
dark theme shipped four measured defects past a green 343-test suite — four controls
at 1.09–1.20:1 because no rule set `color`, a doubled card border, a panel label
stuck off-screen at 375px, and AQI text at 1.43:1. Every one is invisible to the
suite and obvious in a browser.

There is no `playwright` npm package here, but a cached Chromium is on disk and can
be driven directly over CDP with no new dependency:

```
~/Library/Caches/ms-playwright/chromium_headless_shell-<build>/chrome-headless-shell-mac-arm64/chrome-headless-shell
```

Launch it with `--headless --remote-debugging-port=<port> --allow-file-access-from-files`,
scrape the `ws://` URL off **stderr**, and talk to it with Node's built-in
`WebSocket` (global since Node 22 — this project runs v25). `Target.createTarget` →
`Target.attachToTarget` with `flatten: true` → `Runtime.evaluate` with
`returnByValue: true` is enough to read `getComputedStyle` and
`getBoundingClientRect` off a real layout.

Point it at a small HTML file that `<link>`s `app/styles/{tokens,base,components}.css`
by absolute `file://` path and reproduces the markup you care about. That reads the
live repo CSS, so it catches token and cascade bugs without booting Next.

Gotchas, all hit in practice:
- `--dump-dom` hangs; use the CDP socket, not the one-shot flags.
- Nested or malformed markup in the harness silently changes which selectors match,
  so a "wrong" computed value may be the harness, not the app. Verify the element
  matched what you meant before believing the number.
- Set `data-theme="light"` on `<html>` to check light; unset means dark.
- UA widget internals — scrollbars, the caret, a search field's clear button — follow
  from `color-scheme` but are not readable as computed styles. They stay unverified.

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
