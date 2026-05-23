# Day Range Selector — Design Spec

**Date:** 2026-05-23
**Status:** Approved

## Summary

Add a segmented button control that lets users choose how many days of weather data are shown across all sections (forecast chart, daily cards, and history chart). The choice persists in `localStorage`.

## Requirements

- Range: 7, 10, 14, or 16 days
- Applies to both the forecast sections (ForecastChart + DailyCards) and the history section (WeatherChart)
- Default: 7 days (matches current behavior)
- Persists across visits via `localStorage` key `cragweather_days`
- Control placed top-right, above the forecast chart
- No page reload — updates are instant client-side

## Data Layer

`fetchWeather` in `lib/weather.ts` currently hardcodes `past_days=7` and `forecast_days=7`. Both are changed to `16` so the server always returns the full window. The client slices to the chosen N.

- 16 days × 24 hours × ~5 fields ≈ 15 KB JSON — negligible overhead
- No API route changes needed
- No new query params

## Architecture

### New component: `components/WeatherView.tsx`

A `"use client"` component that:

- Accepts `weather: { daily: DailyWeather[]; hourly: HourlyWeather[] }` (full 16-day window in each direction)
- Reads `localStorage.getItem("cragweather_days")` on mount, falls back to `7`; writes on change
- Computes `today` and slices three datasets:
  - **Forecast hourly** — `datetime >= today` and `datetime < today + days` (i.e. N calendar dates: today through today+N−1)
  - **Forecast daily** — `date >= today` and `date < today + days`
  - **History daily** — `date >= today − days` and `date < today` (N calendar dates back)
- Renders in order:
  1. Segmented button group (right-aligned)
  2. `<ForecastChart hourly={slicedHourly} />`
  3. `<DailyCards daily={slicedForecastDaily} hourly={slicedHourly} />`
  4. History section heading ("Past N days") + `<WeatherChart daily={slicedHistoryDaily} />`

### Changes to existing files

| File | Change |
|------|--------|
| `lib/weather.ts` | `past_days` and `forecast_days` both set to `16` |
| `app/route/[id]/page.tsx` | Replace the three weather `<section>` blocks with `<WeatherView weather={weather} />`; remove `today` filtering done inline; update the data-completeness warning threshold from `14 * 24` to `32 * 24` (matches new 16+16 window) |
| `components/ForecastChart.tsx` | No changes |
| `components/WeatherChart.tsx` | No changes |
| `components/DailyCards.tsx` | No changes |
| `components/WindPanel.tsx` | No changes |

## UI Control

```
[ 7d ]  [ 10d ]  [ 14d ]  [ 16d ]
```

- Four buttons in a row, right-aligned above the forecast chart
- Active button: filled/highlighted style using existing CSS color scheme
- No new UI library — styled with `globals.css` patterns
- "Past N days" section heading updates dynamically to match selection

## Testing

- Update the `multiFixture` in `tests/lib/weather.test.ts` to cover 16-day windows if needed
- Verify localStorage persistence manually (pick 14d, reload, confirm 14d is still selected)
- Verify all four options correctly slice forecast and history data
- Verify the history heading text updates
