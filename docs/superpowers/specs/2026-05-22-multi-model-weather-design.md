# Multi-Model Weather Stitching

**Date:** 2026-05-22
**Status:** Approved

## Goal

Use the highest-resolution model available for each day of the 14-day forecast window, and display a per-day model badge so users know the source of each day's data.

## Model Strategy

| Priority | Model | Typical coverage | Open-Meteo model ID |
|---|---|---|---|
| 1st | HRRR | ~48h, CONUS only | `hrrr` |
| 2nd | NAM | ~84h, North America | `nam_conus` |
| 3rd | GFS | 16 days, global | `gfs_global` (verify against Open-Meteo model list — may be `gfs_seamless`) |

The time horizons above are typical but the stitching is **null-driven, not time-based**: for each slot, pick the first model in priority order (HRRR → NAM → GFS) whose values are non-null. HRRR returns nulls past ~48h and outside CONUS; NAM returns nulls past ~84h. GFS always has data globally.

## Geographic Detection

A single bounding-box check in `fetchWeather`:

- **North America:** lat 7–84, lng –169 to –52 → request `models=hrrr,nam_conus,gfs_global`
- **Everywhere else:** no `models` param (Open-Meteo auto-selects best regional model, no badge shown)

No sub-region logic needed — null-stitching handles the CONUS vs. broader-NA distinction automatically.

## API Call

For North American routes, a single `GET /v1/forecast` call with `models=hrrr,nam_conus,gfs_global` (verify exact GFS model ID). Open-Meteo returns an array of three response objects, one per model, each with `daily` and `hourly` arrays of the same length. Null slots indicate missing coverage.

For non-NA routes, the existing call with no `models` param is unchanged.

## Data Shape Changes

`lib/weather.ts` — add optional `model` field to both types:

```ts
export type DailyWeather  = { date: string; tempMax: number; tempMin: number; precip: number; model?: string };
export type HourlyWeather = { datetime: string; temp: number; precip: number; model?: string };
```

`model` is optional so non-NA routes and all existing callers are unaffected. The field flows through the API response to the client without changes to `app/api/route/[id]/route.ts`.

## Stitching Logic

New internal function `stitchModels` in `lib/weather.ts`:

1. Receives an array of three `OmResponse` objects (`[hrrr, nam, gfs]`) and a parallel `modelNames` array (`["HRRR", "NAM", "GFS"]`).
2. For each time index, walks the priority list and picks the first model whose `temperature_2m_max` (daily) or `temperature_2m` (hourly) is non-null.
3. Returns `{ daily: DailyWeather[], hourly: HourlyWeather[] }` with `model` set on each entry.
4. If GFS itself has a null slot (extremely rare), that slot is omitted.

## UI Changes

`components/DailyCards` — render a small badge when `day.model` is defined:

- Positioned bottom-right of each day card
- Text: `"HRRR"`, `"NAM"`, or `"GFS"`
- Styled as a muted chip (small font, secondary color) so it doesn't compete with temp/precip
- No badge shown for non-NA routes (`model` is undefined)

`WeatherChart` — no changes. Per-bar model attribution would be too noisy in the chart.

## Error Handling

- **All models null for a slot:** falls through to GFS; if GFS also null, slot is omitted.
- **Open-Meteo non-200:** `fetchWeather` throws as today; route API catches, returns `weather: null`; UI shows "Weather unavailable."
- **Mixed partial nulls:** stitching is per-slot, so each day/hour is handled independently.

## Files Changed

| File | Change |
|---|---|
| `lib/weather.ts` | Add region detection, multi-model API call, `stitchModels`, updated types |
| `components/DailyCards.tsx` | Render model badge when `day.model` is present |
