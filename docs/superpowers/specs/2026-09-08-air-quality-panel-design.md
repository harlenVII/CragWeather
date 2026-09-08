# Air Quality Panel Design

**Date:** 2026-09-08
**Scope:** Add a sixth forecast panel showing US AQI, below humidity. New endpoint
(`air-quality-api.open-meteo.com`), new `lib/airQuality.ts`, new sibling field on the route
API response. Forecast only — history chart, daily cards and `stitchModels` are untouched.

## Summary

| Panel | Height | Series | Axis |
|---|---|---|---|
| 1 | 260px | temp, feels-like | °C |
| 2 | 150px | precip mm (bars), chance % (line) | mm left, 0–100 right |
| 3 | 150px | wind speed, gust | m/s |
| 4 | 150px | dew point + friction bands | °C |
| 5 | 150px | relative humidity | 0–100% |
| **6** | **150px** | **US AQI + EPA category bands** | **0 → max(100, peak)** |

## Superseding the 2026-09-04 Rejection

`2026-09-04-forecast-panel-stack-design.md` rejected air quality on three grounds. Each is
answered here rather than dismissed:

| Prior objection | Resolution |
|---|---|
| Forecast reaches ~5 days against a 15-day selector | Accepted as real. The uncovered region is **drawn and labelled** as a dead zone rather than left as an ambiguous blank (§4). Absence is stated, not implied. |
| 45 km resolution vs HRRR's 3 km | Accepted as real and **stated in the explainer note** (§5). Coarseness is a caveat for the reader, not a reason to withhold the wildfire-smoke signal that climbers actually plan around. |
| Second endpoint, independent failure mode | Contained: its own `try/catch → null`, concurrent with the weather fetch, and the panel renders nothing at all when data is absent (§1, §4). AQ cannot degrade the weather page. |

The prior spec's note that "a history-only AQI panel remains viable later" (`past_days=92`
works) still holds and is still deferred — see Rejected Alternatives.

## API Research Findings

Established empirically against the live API on 2026-09-08. Not documented by Open-Meteo.

### The forecast horizon is ~4.3–5.0 days, and it is a hard cap

`forecast_days` above 7 is a `400`: *"Forecast days is invalid. Allowed range 0 to 7."*
Requesting 7 does not yield 7 — the trailing hours come back null. Last non-null `us_aqi`:

```
location            last us_aqi hour     ≈ days out
Yosemite            2026-09-12T06:00     4.3
Portland OR         2026-09-12T06:00     4.3
Los Angeles         2026-09-12T06:00     4.3
London              2026-09-12T14:00     4.6
Sydney              2026-09-12T23:00     5.0
```

So the panel is blank for the final ~2.5 days of the 7-day window and roughly two-thirds of
the 15-day window. This is the dominant design constraint.

`forecast_days=7` is still requested rather than the default 5: it costs nothing and London
measured 8 hours beyond what the default returns.

### Nulls are a clean trailing tail — no interior gaps

Checked across `past_days=16&forecast_days=7` (552 slots) on every variable:

```
pm2_5      contiguous_prefix=True  interior_gaps=0
us_aqi     contiguous_prefix=True  interior_gaps=0
ozone      contiguous_prefix=True  interior_gaps=0
dust       contiguous_prefix=True  interior_gaps=0
uv_index   contiguous_prefix=True  interior_gaps=0
```

`connectNulls={false}` is therefore the *entire* gap-handling requirement. No bridging, no
interpolation, no per-hour presence map.

### Values are interpolated to true hourly

The docs describe the global domain as 3-hourly. The response is not stepped:

```
us_aqi[200..214]  49 49 49 49 49 49 49 50 50 51 59 66 71 73 73
```

So the series can be plotted as a line against the weather stack's hourly x-axis without
looking like a staircase artefact.

### Timestamps align hour-for-hour with the weather call

Both calls use `timezone=auto` at the same lat/lng, and both return local wall-clock
`YYYY-MM-DDTHH:00` strings. Joining on `datetime` is exact — no timezone arithmetic.

### `past_days=0` starts the response at today 00:00 local

Confirmed: `forecast_days=5&past_days=0` returned `2026-09-08T00:00 -> 2026-09-12T23:00`.
That is exactly where `forecastHourly` begins, so the forecast-only panel needs no history.

### Clean-air ranges are low, which sets the axis trap

```
Yosemite   us_aqi  17..52
Portland   us_aqi  20..66
London     us_aqi  19..53
LA         us_aqi  59..99
```

Auto-fitting an axis to 17–52 draws a *Good* day as a full-height line. See §3.

## 1. Data Layer — `lib/airQuality.ts` (new)

Separate module. It never touches `stitchModels`: CAMS has no model-priority walk, no
provenance to badge, and one variable.

```ts
export type HourlyAir = { datetime: string; usAqi: number | null };
export type AirQualityResponse = { hourly: HourlyAir[] };

export async function fetchAirQuality(
  lat: number,
  lng: number,
  fetcher: typeof fetch = fetch,
): Promise<AirQualityResponse>;
```

Request:

```
https://air-quality-api.open-meteo.com/v1/air-quality
  ?latitude=..&longitude=..
  &hourly=us_aqi
  &timezone=auto
  &forecast_days=7
  &past_days=0
```

`AbortSignal.timeout(10000)` and a throw on `!res.ok`, matching `fetchWeather`. Nulls are
preserved as `null` — never coerced to `0`, since a rendered AQI of 0 is a claim of
pristine air rather than an absence of data. Same reasoning as `precipChance`.

`domains` is left at its `auto` default (CAMS Europe 11 km blended with CAMS global 45 km);
there is nothing to gain by pinning it.

### Call sites

Both `app/api/route/[id]/route.ts` and `app/at/[coords]/page.tsx` gain an AQ fetch that
**cannot break the weather page**: its own `try/catch → null`, logged like `fetchWeather`'s.

The two fetches run concurrently, so AQ latency never adds to weather latency:

```ts
const [weather, air] = await Promise.all([
  fetchWeather(lat, lng).catch(err => { console.error(...); return null; }),
  fetchAirQuality(lat, lng).catch(err => { console.error(...); return null; }),
]);
```

`Promise.all` over already-caught promises, so neither rejection can settle the pair.

### Response shape

The route API returns a **sibling** field:

```
{ route, weather, air }        // air: AirQualityResponse | null
```

Sibling rather than folded into `HourlyWeather` because the two sources have different
provenance, different horizons and independent failure modes — and because giving
`stitchModels` a CAMS column would mean touching every existing multi-model fixture for a
value it cannot stitch.

## 2. Alignment

### Threading

`air` is passed straight through, unsliced:

```
page / API  →  WeatherView({ weather, air })  →  ForecastChart({ hourly, air })
```

`WeatherView` gains an optional `air` prop and forwards it **without touching
`sliceWeather`**. `lib/sliceWeather.ts` is not modified: the day-window slice applies to
`hourly`, and because the panel's series is built by looking AQ up *per weather hour* (below),
changing the window automatically changes the AQ series with it. Slicing AQ separately would
be a second, redundant source of truth for the window.

### The lookup

`ForecastChart` builds the series by mapping over the **weather** hours and looking AQ up by
datetime:

```ts
const aqiByHour = useMemo(
  () => air ? new Map(air.hourly.map(a => [a.datetime, a.usAqi])) : null,
  [air],
);
const aqiData = useMemo(
  () => hourly.map(h => ({ x: h.datetime, aqi: aqiByHour?.get(h.datetime) ?? null })),
  [hourly, aqiByHour],
);
```

The x extent is then **identical by construction** to the five panels above — same length,
same `x` values, same `ticks`. This is what lets the panel join `panelAlignment.test.tsx` as
a sixth entry, and it is why the panel must never be given its own shorter axis.

`margin.right: 80` (no right-hand axis) and `LEFT_MARGIN`, per the stack's margin rule.

## 3. `lib/aqiBands.ts` (new) — breakpoints and domain together

Deviates from the `dewPointBands.ts` / `tempDomain.ts` split on purpose: there the domain
function is shared by two panels, here the domain exists *only* to keep these bands on
scale, and splitting one panel's constants across two files buys nothing.

### Bands — EPA breakpoints

```ts
export const AQI_BANDS = [
  { min:   0, max:  50, label: "Good",                           fill: "#00e400" },
  { min:  51, max: 100, label: "Moderate",                       fill: "#ffff00" },
  { min: 101, max: 150, label: "Unhealthy for sensitive groups", fill: "#ff7e00" },
  { min: 151, max: 200, label: "Unhealthy",                      fill: "#ff0000" },
  { min: 201, max: 300, label: "Very unhealthy",                 fill: "#8f3f97" },
  { min: 301, max: 500, label: "Hazardous",                      fill: "#7e0023" },
];
```

Rendered at `fillOpacity={0.1}`, and **only where a band intersects the current domain**
(clamped to the domain's bounds so the topmost visible band does not overshoot the axis). A clean
crag therefore shows a calm two-tone panel rather than a permanent rainbow; a smoke event
lights the panel up as the domain grows to reach the upper bands.

`aqiCategory(v)` returns the matching band, used by the tooltip strip (§5).

### Domain

```ts
export const AQI_AXIS_FLOOR = 100;
export const AQI_PAD = 10;                     // headroom above a peak, in AQI points

export function aqiDomain(values: (number | null)[]): [number, number];
// nulls and non-finite values dropped; peak = max of what remains (0 if none)
// -> [0, Math.max(AQI_AXIS_FLOOR, Math.ceil(peak) + AQI_PAD)]
```

**Zero is kept as the baseline.** Unlike temperature — an interval scale where `tempDomain`
floats the minimum — AQI is a ratio scale on which 0 genuinely means "no pollution", the
same property that keeps zero on the precipitation, wind and humidity axes.

**The ceiling is floored at 100** for the `MM_AXIS_FLOOR` reason: auto-fitting Yosemite's
17–52 draws a *Good* day as a full-height line that reads as an emergency, and the scale
would shift silently between crags (17–52 vs LA's 59–99) and between the 7/10/15-day windows,
since the day selector slices the data before it reaches the panel. At a floor of 100 the
Good band is always the bottom half of the panel and Moderate the top half, so a given line
height means the same air everywhere. Above 100 the axis auto-fits, so a genuine smoke event
is never clipped.

The floor is 100 rather than 50 because a floor of 50 would clip Yosemite's own 52 peak.

This also carries the `dewPointDomain` guarantee: a Recharts `ReferenceArea` lying outside
the domain is **discarded entirely, not clipped**, so without an anchored ceiling the Good
and Moderate bands would render inconsistently from crag to crag.

## 4. `components/AirQualityPanel.tsx` (new) — panel 6

150px, standard panel props shape, `memo`-wrapped like the other five.

Bands are emitted **before** the grid and line — SVG has no z-index, so a band declared
later tints the series being traced (the `DewPointPanel` lesson).

### Weekend bands are deliberately omitted from this panel

This is the one place the panel breaks stack consistency, and it is intentional. The weekend
band is amber (`#f59e0b`) — on an AQI chart that is *the colour of "Unhealthy for sensitive
groups"*. A reader scanning the amber Saturday column could read it as pollution. That is a
semantic collision, not merely a muddy overlap, and it is worse than the amber-on-amber
problem `DewPointPanel` avoided by switching to sky/rose. The weekend cue is still carried by
the five panels directly above, sharing the same x-axis.

### Dead zone

A grey `ReferenceArea` spanning the first null hour to the end of the window, plus a
`.chart-note` naming the cutoff:

> Air-quality forecast ends **Sat 12 Sep, 06:00**. CAMS does not forecast further ahead.

Computed from the last non-null entry in `aqiData`; the band spans from the *next* hour after
it to the final `x` value. The cutoff is formatted from the raw local timestamp string
(`2026-09-12T06:00`) with no `Date` parsing — the timestamps are already crag-local wall
clock, and constructing a `Date` from them would reinterpret them in the viewer's zone, the
same trap `localDayAndHour` exists to avoid.

If there is no null tail, no band and no cutoff sentence render.

### Absent-data case

If `air` is `null` (fetch failed) or every value is null, the panel, its note and its
explainer render **nothing at all** — not an empty 150px box under a full-width grey wash.
The rest of the stack is unaffected.

## 5. Tooltip Strip and Explainer

One additional span in `ForecastChart`'s strip, rendered only when the value is non-null
(the `precipChance` pattern), coloured by `aqiCategory(v).fill`:

```
… 62% RH · 4 m/s · 7 m/s gust · AQI 42
```

`ActivePoint` gains `aqi: number | null`.

Explainer `.chart-note` below the panel, interpolating the band constants rather than
hardcoding numbers in prose (the `dewPointBands` rule):

> **US AQI** combines several pollutants into one 0–500 scale; at a crag the thing that
> usually moves it is wildfire smoke. Under 50 is clean air. The forecast comes from CAMS at
> ~45 km resolution, so it will not resolve a valley inversion or a single plume — nearby
> crags read the same, and local smoke can be much worse than shown.

The resolution caveat is not optional; it is the honest answer to the prior spec's objection.

## 6. Testing

New:

- `tests/lib/airQuality.test.ts` — parses `us_aqi`, preserves the null tail as `null`,
  throws on non-2xx, and returns hours starting at today 00:00.
- `tests/lib/aqiBands.test.ts` — `aqiDomain` holds `[0, 100]` for clean air, extends above
  100 for a smoke peak, never floats the lower bound off zero; band intersection returns two
  bands for clean air and more as the domain grows; `aqiCategory` boundaries at 50/51 and
  100/101.
- `tests/components/AirQualityPanel.test.tsx` — the hoisted `vi.mock("recharts", …)`
  sized-container pattern from `TempPanel.test.tsx`; asserts the dead-zone note text, and
  that a null-only series renders nothing.

Extended:

- `tests/components/panelAlignment.test.tsx` — sixth panel, compared against `TempPanel`'s
  extent like the rest. This is the regression guard for §2.
- `tests/components/panelMemoization.test.tsx` — sixth panel.
- `tests/mocks/handlers.ts` — a default `http.all("https://air-quality-api.open-meteo.com/*")`
  handler, so existing tests do not make live calls.
- `tests/api/route.test.ts` and `tests/components/GpsWeatherPage.test.tsx` — a case asserting
  **the page still renders the full weather stack when the AQ fetch fails**.

## 7. Files Touched

New:

| File | Purpose |
|---|---|
| `lib/airQuality.ts` | `fetchAirQuality`, `HourlyAir`, `AirQualityResponse` |
| `lib/aqiBands.ts` | `AQI_BANDS`, `AQI_AXIS_FLOOR`, `AQI_PAD`, `aqiDomain`, `aqiCategory` |
| `components/AirQualityPanel.tsx` | Panel 6 |

Modified:

| File | Change |
|---|---|
| `app/api/route/[id]/route.ts` | Concurrent AQ fetch; `air` added to the JSON body |
| `app/route/[id]/page.tsx` | `ApiResponse` gains `air`; destructure and pass to `WeatherView` |
| `app/at/[coords]/page.tsx` | Concurrent AQ fetch; pass `air` to `WeatherView` |
| `components/WeatherView.tsx` | Optional `air` prop, forwarded to `ForecastChart` unsliced |
| `components/ForecastChart.tsx` | `air` prop, `aqiByHour`/`aqiData` memos, panel 6, strip span, explainer |
| `CLAUDE.md` | Panel-stack list, second-endpoint section, new key files |

Explicitly **not** modified: `lib/weather.ts`, `lib/sliceWeather.ts`, `lib/tempDomain.ts`,
`components/WeatherChart.tsx`, `components/DailyCards.tsx`.

## 8. Request Budget

This doubles outbound Open-Meteo calls per page view, and both hosts draw on the same
free-tier non-commercial allowance. No new mechanism is introduced: the AQ call sits inside
the existing `Cache-Control: public, max-age=600` on the route API and `revalidate = 600` on
the coords page — already far tighter than CAMS' 12-hour (global) / 24-hour (Europe) update
cycle.

## Rejected Alternatives

**PM2.5 + PM10 in µg/m³ instead of AQI.** More honest about what is measured and
language-neutral, but climbers have no intuition for 12 vs 35 µg/m³, and it needs its own
invented threshold story. AQI is the number people already read off smoke maps and its
breakpoints are official.

**US AQI plus PM2.5 on a second axis.** Would distinguish a smoke spike from an ozone day,
but a 150px panel carrying two axes and two threshold stories is where this stack stops being
readable.

**Truncating the panel to its own shorter x-axis.** Uses the width, but silently breaks
horizontal register with the five panels above — precisely the failure
`panelAlignment.test.tsx` exists to catch. A hover at x=60% would mean a different hour than
in every other panel.

**Clamping the day selector to what AQ covers.** Discards ten days of good weather forecast
to accommodate the weakest input.

**Keeping weekend bands on the panel at lower opacity.** Reduces the muddiness but not the
semantic collision — amber still reads as an AQI category. See §4.

**UV index.** Rides along free in the same request and has full coverage on this endpoint
(unlike the weather API, where the 2026-09-04 spec measured it GFS-only). Genuinely relevant
for crag exposure, but it is a separate story with its own thresholds and explainer, and
`fetchAirQuality` returning it later is a small follow-up. Out of scope.

**European AQI for non-NA crags.** `european_aqi` exists and `isNorthAmerica` could select
it, but two indices means two band sets, two explainers and a branch in the panel, for an app
whose stated common case is US users viewing US crags.

**A history AQI panel.** `past_days=92` works, so this stays viable — but the history section
is daily-aggregated and would need an AQI aggregation rule (peak? mean?) that has no obvious
right answer. Deferred, as the 2026-09-04 spec also concluded.
