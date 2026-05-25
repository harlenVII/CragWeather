# Mobile Chart UX — Horizontal Scroll + Pinned Tooltip

**Date:** 2026-05-25  
**Scope:** `ForecastChart`, `WindPanel` (hourly charts only). `WeatherChart` (history) is out of scope.

---

## Problem

On mobile (~390px viewport) with 15 days of hourly data, the forecast charts are:
1. Horizontally cramped — axis labels overlap, HRRR/NAM model labels collide.
2. The floating Recharts tooltip covers ~50% of the chart area when tapped.

---

## Change 1 — Horizontal Scroll

### Structure

```
.chart-wrap (existing card: border, radius, padding)
  .chart-scroll  (overflow-x: auto; -webkit-overflow-scrolling: touch)
    .chart-inner  (min-width: 700px)
      <ResponsiveContainer height={320}>  ← ForecastChart
      <WindPanel .../>                    ← uses its own ResponsiveContainer
```

Both charts live inside a **single** `.chart-inner`, so they scroll as one unit.

### CSS additions to `globals.css`

```css
.chart-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.chart-inner  { min-width: 700px; }
```

No mobile-only media query needed: `min-width: 700px` is a no-op on wide desktops where the container is already wider. `overflow-x: auto` only triggers a scrollbar when content overflows.

### Files changed

- `app/globals.css` — add two new utility classes
- `components/ForecastChart.tsx` — wrap `ResponsiveContainer` + `WindPanel` in `.chart-scroll > .chart-inner`

---

## Change 2 — Pinned Tooltip Strip

### State

`ForecastChart` adds:

```ts
const [activePoint, setActivePoint] = useState<ActivePoint | null>(null);

type ActivePoint = {
  datetime: string;
  temp: number | null;
  precip: number | null;
  windSpeed: number | null;
  windGust: number | null;
};
```

### Data flow

- `<ComposedChart onMouseMove={handleMove} onMouseLeave={clear}>` — extracts `temp` + `precip` from `activePayload`.
- `WindPanel` receives `onHover(speed, gust, datetime)` + `onLeave()` props. Its `<ComposedChart>` calls these to contribute wind values.
- `onMouseLeave` and `onTouchEnd` on both charts call `clear()`.

The two chart `onMouseMove` handlers merge into the same `activePoint` state: the ForecastChart handler sets `temp`/`precip`/`datetime`; the WindPanel handler sets `windSpeed`/`windGust`.

### Rendering

The tooltip strip renders **above** `.chart-scroll`, inside `.chart-wrap`, as a single compact row:

```
05-27 09:00   12°C   0 mm   3 m/s   5 m/s gust
```

Hidden (`display: none` or conditional render) when `activePoint` is null.

### Tooltip removed from

- `<Tooltip>` removed from `ForecastChart`'s `ComposedChart`
- `<Tooltip>` removed from `WindPanel`'s `ComposedChart`

### Files changed

- `components/ForecastChart.tsx` — add state, `onMouseMove`/`onMouseLeave`, render tooltip strip, remove `<Tooltip>`
- `components/WindPanel.tsx` — add `onHover`/`onLeave` props, wire `onMouseMove`/`onMouseLeave`, remove `<Tooltip>`

---

## Out of Scope

- `WeatherChart` (history): 7 daily data points, default tooltip is acceptable.
- No changes to `DailyCards`, `WeatherView`, or any other component.
- No tests required (pure UI/interaction change, no logic change).
