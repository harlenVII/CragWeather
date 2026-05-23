# Multi-Model Weather Stitching

**Date:** 2026-05-22
**Status:** Approved

## Goal

Use the highest-resolution model available for each day of the 14-day forecast window, and display a per-day model badge so users know the source of each day's data.

## Model Strategy

| Priority | Model | Coverage | Open-Meteo model ID |
|---|---|---|---|
| 1st | ERA5 | Past days (historical analysis, ~5-day lag filled by seamless blend) | `era5_seamless` |
| 2nd | HRRR | Future ~48h, CONUS only | `hrrr` |
| 3rd | NAM | Future ~84h, North America | `nam_conus` |
| 4th | GFS | 16-day forecast + full analysis, global | `gfs_global` (verify — may be `gfs_seamless`) |

The split between past and future is handled automatically by null-driven stitching:
- **Past slots:** ERA5 has data; HRRR/NAM have no hindcast (null) → ERA5 wins
- **Future 0–48h:** ERA5 is null; HRRR has data → HRRR wins
- **Future 48–84h:** ERA5/HRRR null; NAM has data → NAM wins
- **Future 84h+:** ERA5/HRRR/NAM null; GFS has data → GFS wins

Day card badges show `"ERA5"` for past days and `"HRRR"`/`"NAM"`/`"GFS"` for future days.

## Geographic Detection

A single bounding-box check in `fetchWeather`:

- **North America:** lat 7–84, lng –169 to –52 → request `models=hrrr,nam_conus,gfs_global`
- **Everywhere else:** no `models` param (Open-Meteo auto-selects best regional model, no badge shown)

No sub-region logic needed — null-stitching handles the CONUS vs. broader-NA distinction automatically.

## API Call

For North American routes, a single `GET /v1/forecast` call with `models=era5_seamless,hrrr,nam_conus,gfs_global` (verify exact GFS model ID). **Only `hourly` data is requested** — no `daily` param. Open-Meteo returns an array of three response objects, one per model, each with `hourly` arrays of the same length. Null slots indicate missing coverage.

Daily values (max temp, min temp, precip) are **derived from the stitched hourly data** inside `stitchModels`. This avoids a boundary accuracy problem: Open-Meteo's pre-aggregated daily values for a model can represent a partial day (e.g. HRRR's 48h window cutting mid-day), producing a non-null but underestimated daily max. Deriving from hourly is always accurate regardless of where the cutoff falls.

For non-NA routes, the existing call (with both `daily` and `hourly` params, no `models` param) is unchanged.

## Data Shape Changes

`lib/weather.ts` — add optional `model` field to both types, and add `OmHourlyResponse` for the multi-model case:

```ts
export type DailyWeather  = { date: string; tempMax: number; tempMin: number; precip: number; model?: string };
export type HourlyWeather = { datetime: string; temp: number; precip: number; model?: string };

// Used for multi-model NA requests (no daily field needed)
type OmHourlyResponse = {
  hourly: { time: string[]; temperature_2m: (number | null)[]; precipitation: (number | null)[]; };
};
```

`model` is optional so non-NA routes and all existing callers are unaffected. The field flows through the API response to the client without changes to `app/api/route/[id]/route.ts`.

## Stitching Logic

New exported function `stitchModels` in `lib/weather.ts`:

1. Receives an array of three `OmHourlyResponse` objects (`[hrrr, nam, gfs]`) and a parallel `modelNames` array (`["HRRR", "NAM", "GFS"]`).
2. For each hourly index, walks the priority list and picks the first model whose `temperature_2m` is non-null. Tags the entry with that model name.
3. Groups stitched hourly entries by calendar date (`datetime.slice(0, 10)`). For each day group, computes `tempMax`, `tempMin`, `precip` from the hours, and sets `model` to whichever model contributed the most hours that day.
4. Returns `{ daily: DailyWeather[], hourly: HourlyWeather[] }`.
5. If a slot has all models null, it is omitted from the hourly output (and therefore from daily aggregation).

## UI Changes

`components/DailyCards` — render a small badge when `day.model` is defined:

- Positioned bottom-right of each day card
- Text: `"HRRR"`, `"NAM"`, or `"GFS"`
- Styled as a muted chip (small font, secondary color) so it doesn't compete with temp/precip
- No badge shown for non-NA routes (`model` is undefined)

`WeatherChart` — no changes. Per-bar model attribution would be too noisy in the chart.

## Missing Data Warning

If any hourly slot is omitted by stitching (all models null), `weather.hourly.length` will be less than the expected `14 * 24 = 336`. `app/route/[id]/page.tsx` checks this client-side and renders a banner above the chart when true:

> "Some weather data is unavailable — forecast may be incomplete."

Styled as a muted caution note (`weather-warning` CSS class). No API or type changes — the page already receives `weather.hourly`.

## Error Handling

- **All models null for a slot:** slot is omitted from hourly; missing-data banner fires if any slot is omitted.
- **Open-Meteo non-200:** `fetchWeather` throws as today; route API catches, returns `weather: null`; UI shows "Weather unavailable."
- **Mixed partial nulls:** stitching is per-slot, so each day/hour is handled independently.

## Files Changed

| File | Change |
|---|---|
| `lib/weather.ts` | Add region detection, multi-model API call, `stitchModels`, updated types |
| `components/DailyCards.tsx` | Render model badge when `day.model` is present |
| `app/route/[id]/page.tsx` | Render missing-data banner when `hourly.length < 336` |
