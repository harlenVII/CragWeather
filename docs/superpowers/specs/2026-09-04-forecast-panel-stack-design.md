# Forecast Panel Stack Design

**Date:** 2026-09-04
**Scope:** Add humidity, feels-like, dew point and chance-of-precipitation to the hourly forecast; restructure `ForecastChart` into a four-panel stack. History chart and daily cards keep their current metrics.

## Summary

The forecast section becomes four stacked panels sharing one x-axis and one hover state:

| Panel | Height | Series | Axis |
|---|---|---|---|
| 1 | 260px | temp, feels-like, dew point | °C |
| 2 | 150px | precipitation mm (bars), chance % (line) | dual: mm left, 0–100 right |
| 3 | 150px | relative humidity | 0–100% |
| 4 | 150px | wind speed, gust | m/s |

Air quality was investigated and deliberately excluded (see Rejected Alternatives).

## API Research Findings

These were established empirically against the live Open-Meteo API across six crags
(Index WA, Yosemite, Linville NC, Boulder CO, Cannon NH, Joshua Tree CA) over the full
`past_days=16&forecast_days=16` window (768 hourly slots). They justify the decisions
below and are recorded because they are not documented by Open-Meteo.

### Humidity, feels-like and dew point stitch for free

`relative_humidity_2m`, `apparent_temperature` and `dew_point_2m` have null patterns
**identical to `temperature_2m`** at every slot for all three models. They require no new
stitching logic — they ride the existing winning-model walk exactly as wind does.

```
Cannon NH, past_days=16 + forecast_days=16 (768 slots), non-null counts

variable                     HRRR   NAM   GFS
temperature_2m                447   459   768
relative_humidity_2m          447   459   768
apparent_temperature          447   459   768
wind_speed_10m                447   459   768
precipitation_probability     663     0   768   <- the outlier
```

Model window lengths vary by a few hours between crags and between fetches; the pattern
(HRRR shortest, NAM ~12h longer, GFS full) held at all six.

### `precipitation_probability` is not a per-model value

NAM returns **0/768 at every crag tested** — structurally absent, not a transient outage.

More importantly, the value served under the HRRR prefix is **bit-for-bit `gfs_seamless`**,
not HRRR data. Measured at Cannon NH:

```
HRRR-prefixed probability compared against:
  inside HRRR window (n=63)    vs gfs_seamless   IDENTICAL  (diff 0.00)
                               vs gfs_global     differs    (diff 36.44)
  outside HRRR window (n=216)  vs gfs_seamless   diff 0.03
                               vs gfs_global     diff 5.78
```

This matches the docs, which describe probability as "based on ensemble weather models with
0.25° (~27 km) resolution" — one ensemble product, surfaced under whichever prefix is
requested. There is no HRRR-resolution probability to preserve.

The HRRR-prefixed column additionally **degrades before it ends**: it is only 663–669/768
non-null, and in its final hours it flatlines (repeats one value) while `gfs_seamless`
continues to vary. Observed at all six crags on the same date:

```
Boulder    HRRRprefix  29 29 29     seamless  26 25 25
Cannon     HRRRprefix  13 13 13     seamless  14 16 18
Index      HRRRprefix  17 17 17     seamless  19 21 22
Linville   HRRRprefix  32 32 32     seamless  33 35 37
```

**Conclusion:** probability must be read from a single `gfs_seamless` column and must not be
stitched. A per-field fallback would drop onto `gfs_global` — a genuinely different, coarser
series — for the 12-hour NAM band, producing a visible discontinuity for no benefit.

### `gfs_seamless` is a server-side stitch, and is free to adopt

`gfs_seamless` is Open-Meteo blending the NCEP family ("Seamless combines all models from a
given provider into a seamless prediction"). Empirically it is HRRR where HRRR exists and
plain GFS everywhere after — **it does not use NAM**:

```
inside HRRR window   seamless vs ncep_hrrr_conus   diff 0.00 (max 0.10, rounding)
NAM-only band        seamless vs ncep_nam_conus    diff 1.42   <- not NAM
                     seamless vs gfs_global        IDENTICAL
beyond NAM           seamless vs gfs_global        IDENTICAL
```

Tier 3 is only ever *read* where HRRR and NAM are both null. Restricted to those 309 hours,
`gfs_seamless` and `gfs_global` are identical on every variable used:

```
tier-3 territory only (n=309)
  temperature_2m / precipitation / wind_speed_10m
  wind_gusts_10m / relative_humidity_2m / apparent_temperature
  -> all IDENTICAL, meanAbsDiff 0.000
```

So swapping tier 3 to `gfs_seamless` **changes no currently displayed value** while gaining
full-window probability coverage. Payload 89.7 KB vs 113.4 KB for adding it as a 4th model.

This also clarifies what the manual stitcher is *for*: its value over `gfs_seamless` is the
12-hour NAM band plus per-hour model provenance (which drives the badges and dividers, and
which `gfs_seamless` cannot supply). That justification should survive in CLAUDE.md.

## Data Layer (`lib/weather.ts`)

### Model list

Tier 3 changes id and keeps its label:

```ts
const NA_MODELS = [
  { id: "ncep_hrrr_conus", label: "HRRR" },
  { id: "ncep_nam_conus",  label: "NAM"  },
  { id: "gfs_seamless",    label: "GFS"  },   // was gfs_global
];
```

### Type changes

```ts
export type HourlyWeather = {
  datetime: string;
  temp: number;
  feelsLike: number;      // apparent_temperature
  dewPoint: number;       // dew_point_2m
  humidity: number;       // relative_humidity_2m
  precip: number;
  precipChance: number | null;   // gfs_seamless only, NOT stitched
  windSpeed: number;
  windGust: number;
  model?: string;
};
// DailyWeather — no changes
```

`precipChance` is nullable rather than defaulting to `0`: a rendered "0%" is a claim about
the weather, not an absence of data. Coverage measured 768/768 so nulls should not occur in
practice, but a broken line is preferable to a confident wrong value.

### API request changes

Add to the `hourly` param on both paths:
`relative_humidity_2m,apparent_temperature,dew_point_2m,precipitation_probability`

### NA multi-model path

`OmHourlyResponse.hourly` gains `relative_humidity_2m`, `apparent_temperature` and
`dew_point_2m` as `(number | null)[]`, extracted with the existing prefix pattern.

In `stitchModels`, carry `feelsLike`, `dewPoint` and `humidity` from the winning model's slot
alongside `windSpeed`/`windGust` — same null-driven priority walk, no new logic.

`precipChance` is handled separately. `stitchModels` gains a second parameter carrying the
seamless probability array, read positionally at each index regardless of which model wins:

```ts
export function stitchModels(
  responses: OmHourlyResponse[],
  names: string[],
  precipChance?: (number | null)[],
): WeatherResponse
```

Omitting it yields `precipChance: null` throughout, keeping the function usable in isolation.

### Non-NA path

Read all four new variables directly from `j.hourly`; `OmResponse.hourly` gains them.
`precipitation_probability` is available on the default single-model call, so the non-NA path
needs no special handling.

### Daily values

Unchanged. `DailyWeather` gains no aggregates, and `partialToday` in `lib/sliceWeather.ts`
is untouched. Daily aggregation of humidity/dew point is deferred with the history section.

## Component Structure

`ForecastChart` remains the **stack coordinator** and keeps ownership of the single hover
index, the tooltip strip, `dayTicks`, `buildSections` and `weekendBands`. Its own chart moves
out into `TempPanel` so the coordinator stops doing double duty.

```
ForecastChart  (coordinator)
├── TempPanel       260px
├── PrecipPanel     150px
├── HumidityPanel   150px
└── WindPanel       150px   (unchanged)
```

All four panels take the props shape `WindPanel` already defines:

```ts
interface PanelProps<T> {
  data: T[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
  weekendBands?: WeekendBand[];
  onHover?: (index: number) => void;
  onLeave?: () => void;
}
```

Standardising on the existing interface is what makes the history section cheap to convert
later — it composes the same panels against daily data without modifying them.

Model labels and section dividers stay on **panel 1 only**, as today. Dividers on panel 2
would be wrong: the chance line is not stitched and does not change model at those
boundaries.

### Panel specs

**`TempPanel`** — three lines on one °C axis: temp (`#dc2626`, solid), feels-like (same hue,
dashed, so it reads as a variant of temperature), dew point (muted, dotted). Single axis is
the point: the gap between the temp and dew-point lines is the condensation signal.

**`PrecipPanel`** — mm as bars on the left axis (`#60a5fa`, as today); chance as a line on a
right axis with a fixed `[0, 100]` domain so its height means the same thing at every crag
and day-window. `connectNulls={false}`.

**`HumidityPanel`** — single RH line, fixed `[0, 100]` domain.

**`WindPanel`** — unchanged.

### Tooltip strip

Extends to: time · temp · feels-like · dew point · mm · chance% · wind · gust.

### Dew-point explainer

A `.chart-note` caption below panel 1, following the pattern `WeatherChart` already uses for
its partial-day note:

> **Dew point** is the temperature at which air becomes saturated. When the temperature line
> drops toward the dew-point line, moisture condenses and rock goes damp even without rain.
> Below ~5°C means dry air and better friction; above ~15°C feels greasy.

Static copy. A dynamic condensation warning is a plausible follow-up but is out of scope.

## Adjacent Fix

`components/DailyCards.tsx:13` derives today via `new Date().toISOString().slice(0, 10)` —
the exact pattern CLAUDE.md warns against. During a US evening the UTC date has already
rolled over, so today's card silently loses its model badge. `WeatherView` already computes
`today` via `localDayAndHour`; pass it in as a prop.

## Testing

- `tests/lib/weather.test.ts` — `multiFixture` gains the four new prefixed arrays per model,
  including a `gfs_seamless` probability array and an all-null NAM one. New cases:
  - probability is sourced from seamless regardless of which model wins the hour
  - NAM-band hours carry a chance value while keeping NAM temp/wind
  - humidity / feels-like / dew point follow the winning model
  - `precipChance` is `null` when the seamless array is absent
- Component tests for `TempPanel`, `PrecipPanel`, `HumidityPanel`; existing `ForecastChart`
  tests updated for the extraction.
- Non-NA single-model path asserts the four new fields.
- `DailyCards` test for the badge boundary using an injected `today`.

## Rejected Alternatives

**Air quality.** Available at `air-quality-api.open-meteo.com` (`us_aqi`, `pm2_5`, `pm10`,
ozone, dust) under the same licence, but rejected for this iteration: forecast reaches only
~5 days against the app's 15-day selector (41 trailing nulls of 216 measured), resolution is
45 km globally versus HRRR's 3 km, and it requires a second endpoint with an independent
failure mode. Historical coverage is good (`past_days=92` works), so a history-only AQI panel
remains viable later.

**Per-field fallback for probability.** Rejected once the HRRR-prefixed column proved to be
`gfs_seamless`. Falling back to `gfs_global` for the NAM band would inject a different,
coarser series for 12 hours and create a visible discontinuity.

**Reading probability off the HRRR prefix.** Correct series, but only 663/768 non-null and it
flatlines before ending — the 15-day view would lose chance-of-rain at the tail.

**Adding `gfs_seamless` as a 4th model.** Functionally equivalent to the swap but 23 KB
heavier per request, with a redundant model in the URL.

**Splitting precipitation into two panels.** Rejected: a fifth panel in an already-tall
mobile stack, and it separates two things climbers read together.

**UV index.** Available but GFS-only (0/768 on both HRRR and NAM), so it would need
always-GFS handling. Out of scope.
