# Wind Forecast Design

**Date:** 2026-05-23
**Scope:** Add wind speed + gust to the hourly forecast chart only (no history).

## Summary

Show wind speed and gusts as a separate panel below the existing `ForecastChart`. History chart (`WeatherChart`) and daily cards are untouched.

## Data Layer (`lib/weather.ts`)

### Type changes

```ts
export type HourlyWeather = {
  datetime: string;
  temp: number;
  precip: number;
  windSpeed: number;
  windGust: number;
  model?: string;
};
// DailyWeather — no changes
```

### API request changes

Add `wind_speed_10m,wind_gusts_10m` to the `hourly` param for both the NA multi-model path and the non-NA single-model path.

### NA multi-model path (`stitchModels`)

`OmHourlyResponse` gains two new optional arrays:
```ts
wind_speed_10m: (number | null)[];
wind_gusts_10m: (number | null)[];
```

In `fetchWeather`, extract them from the prefixed multi-response object using the same pattern as `temperature_2m` and `precipitation`:
```
wind_speed_10m_ncep_hrrr_conus
wind_speed_10m_ncep_nam_conus
wind_speed_10m_gfs_global
wind_gusts_10m_ncep_hrrr_conus
...
```

In `stitchModels`, carry `windSpeed` and `windGust` from the winning model's slot (same null-driven priority walk already used for temp).

### Non-NA path

Read `wind_speed_10m` and `wind_gusts_10m` directly from `j.hourly` and map them onto `HourlyWeather`. `OmResponse.hourly` gains those two fields.

## `WindPanel` Component (`components/WindPanel.tsx`)

```ts
interface WindPanelProps {
  data: { x: string; speed: number; gust: number }[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
}
```

Renders a `ComposedChart` (~160px tall via `ResponsiveContainer`):
- **Gusts** — `Bar`, semi-transparent fill (e.g. `#93c5fd` at 60% opacity)
- **Speed** — `Line`, solid darker stroke (e.g. `#2563eb`), no dots
- **Y-axis** — left, labeled `"km/h"`
- **X-axis** — uses `ticks` and `tickFormatter` passed from parent so columns align with the chart above
- **Legend** — "Speed (km/h)" and "Gust (km/h)"
- **Tooltip** — shows both values

## `ForecastChart` Changes

1. Map hourly to wind panel data:
   ```ts
   const windData = hourly.map(h => ({
     x: h.datetime,
     speed: Math.round(h.windSpeed),
     gust: Math.round(h.windGust),
   }));
   ```
2. Render `<WindPanel data={windData} ticks={dayTicks} tickFormatter={(v) => v.slice(5, 10)} />` directly below the existing `<ResponsiveContainer>`, inside the same `.chart-wrap` div.

## Out of Scope

- Wind on `WeatherChart` (history)
- Wind direction
- Wind in `DailyCards` hourly expand list
- Unit toggle (km/h hardcoded; Open-Meteo default)

## Testing

- Update `HourlyWeather` fixture shape in `tests/lib/weather.test.ts` — add `windSpeed`/`windGust` fields to the mock response (both `multiFixture` for NA and the single-model fixture for non-NA).
- Verify `stitchModels` carries wind from the winning model slot (existing stitching test can be extended).
- No new component tests required — `WindPanel` is a pure rendering component with no logic.
