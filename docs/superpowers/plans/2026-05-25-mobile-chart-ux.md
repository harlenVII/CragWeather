# Mobile Chart UX — Horizontal Scroll + Pinned Tooltip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the forecast charts horizontally scrollable on mobile and replace the floating Recharts tooltip with a pinned strip above the chart area.

**Architecture:** Add CSS utility classes for the scroll container and tooltip strip; lift hover state into `ForecastChart`; both `ForecastChart` and `WindPanel` call a shared `handleHover(index)` that looks up all values from the index-aligned `data`/`windData` arrays; no `<Tooltip>` component remains on either chart.

**Tech Stack:** Next.js, React, Recharts 3.x (`onMouseMove` with `activeTooltipIndex`), CSS

---

### Task 1: Add CSS utility classes [model: claude-haiku-4-5-20251001]

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Open `app/globals.css` and add three new classes after `.chart-wrap`**

The current line is:
```css
.chart-wrap { background: var(--card); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1rem; }
```

Add immediately after it:
```css
.chart-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.chart-inner  { min-width: 700px; }
.chart-tooltip-strip {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  align-items: center;
  padding: 0.375rem 0.5rem;
  margin-bottom: 0.5rem;
  background: #f9fafb;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  font-size: 0.8125rem;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "feat: add chart-scroll, chart-inner, chart-tooltip-strip CSS classes"
```

---

### Task 2: Update WindPanel to emit hover/leave callbacks and remove Tooltip [model: claude-haiku-4-5-20251001]

**Files:**
- Modify: `components/WindPanel.tsx`

- [ ] **Step 1: Replace the full contents of `components/WindPanel.tsx` with**

```tsx
"use client";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

interface WindPanelProps {
  data: { x: string; speed: number; gust: number }[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
  onHover?: (index: number) => void;
  onLeave?: () => void;
}

export function WindPanel({ data, ticks, tickFormatter, onHover, onLeave }: WindPanelProps) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 80, bottom: 16, left: 0 }}
        onMouseMove={(state) => {
          const idx = state.activeTooltipIndex;
          if (typeof idx === "number" && onHover) onHover(idx);
        }}
        onMouseLeave={onLeave}
        onTouchEnd={onLeave}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="x" ticks={ticks} tickFormatter={tickFormatter} />
        <YAxis label={{ value: "m/s", angle: -90, position: "insideLeft" }} />
        <Legend />
        <Bar dataKey="gust" name="Gust (m/s)" fill="#6ee7b7" fillOpacity={0.6} />
        <Line dataKey="speed" name="Speed (m/s)" stroke="#059669" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/WindPanel.tsx
git commit -m "feat: add onHover/onLeave props to WindPanel, remove floating Tooltip"
```

---

### Task 3: Update ForecastChart — scroll wrapper + pinned tooltip [model: claude-haiku-4-5-20251001]

**Files:**
- Modify: `components/ForecastChart.tsx`

- [ ] **Step 1: Replace the full contents of `components/ForecastChart.tsx` with**

```tsx
"use client";
import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { HourlyWeather } from "@/lib/weather";
import { WindPanel } from "@/components/WindPanel";

type Section = { model: string; start: string; mid: string; end: string };

type ActivePoint = {
  datetime: string;
  temp: number;
  precip: number;
  windSpeed: number;
  windGust: number;
};

function buildSections(hourly: HourlyWeather[]): Section[] {
  const buckets: { model: string; hours: string[] }[] = [];
  for (const h of hourly) {
    if (!h.model) continue;
    const last = buckets.at(-1);
    if (!last || last.model !== h.model) {
      buckets.push({ model: h.model, hours: [h.datetime] });
    } else {
      last.hours.push(h.datetime);
    }
  }
  return buckets.map(b => ({
    model: b.model,
    start: b.hours[0],
    mid: b.hours[Math.floor(b.hours.length / 2)],
    end: b.hours[b.hours.length - 1],
  }));
}

export function ForecastChart({ hourly }: { hourly: HourlyWeather[] }) {
  const [activePoint, setActivePoint] = useState<ActivePoint | null>(null);

  const data = hourly.map(h => ({
    datetime: h.datetime,
    temp: Math.round(h.temp),
    precip: h.precip,
  }));

  const windData = hourly.map(h => ({
    x: h.datetime,
    speed: Math.round(h.windSpeed),
    gust: Math.round(h.windGust),
  }));

  const dayTicks = data
    .filter(d => d.datetime.slice(11) === "00:00")
    .map(d => d.datetime);

  const sections = buildSections(hourly);

  function handleHover(idx: number) {
    if (idx < 0 || idx >= data.length) return;
    setActivePoint({
      datetime: data[idx].datetime,
      temp: data[idx].temp,
      precip: data[idx].precip,
      windSpeed: windData[idx].speed,
      windGust: windData[idx].gust,
    });
  }

  function clear() {
    setActivePoint(null);
  }

  return (
    <div className="chart-wrap">
      {activePoint && (
        <div className="chart-tooltip-strip">
          <span>{activePoint.datetime.replace("T", " ")}</span>
          <span style={{ color: "#dc2626" }}>{activePoint.temp}°C</span>
          <span style={{ color: "#60a5fa" }}>{activePoint.precip} mm</span>
          <span style={{ color: "#059669" }}>{activePoint.windSpeed} m/s</span>
          <span style={{ color: "#6b7280" }}>{activePoint.windGust} m/s gust</span>
        </div>
      )}
      <div className="chart-scroll">
        <div className="chart-inner">
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              data={data}
              margin={{ top: 32, right: 32, bottom: 16, left: 0 }}
              onMouseMove={(state) => {
                const idx = state.activeTooltipIndex;
                if (typeof idx === "number") handleHover(idx);
              }}
              onMouseLeave={clear}
              onTouchEnd={clear}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis
                dataKey="datetime"
                ticks={dayTicks}
                tickFormatter={(v: string) => v.slice(5, 10)}
              />
              <YAxis yAxisId="precip" orientation="left" label={{ value: "mm", angle: -90, position: "insideLeft" }} />
              <YAxis yAxisId="temp" orientation="right" width={48} label={{ value: "°C", angle: 90, position: "insideRight" }} />
              <Legend />

              {sections.map(s => (
                <ReferenceLine
                  key={`label-${s.start}`}
                  x={s.mid}
                  yAxisId="temp"
                  stroke="none"
                  label={{ value: s.model, position: "top", fill: "#6b7280", fontSize: 11, fontWeight: 500 }}
                />
              ))}

              {sections.slice(1).map(s => (
                <ReferenceLine
                  key={`div-${s.start}`}
                  x={s.start}
                  yAxisId="temp"
                  stroke="#d1d5db"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
              ))}

              <Bar yAxisId="precip" dataKey="precip" name="Precip (mm)" fill="#60a5fa" />
              <Line yAxisId="temp" dataKey="temp" name="Temp (°C)" stroke="#dc2626" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <WindPanel
            data={windData}
            ticks={dayTicks}
            tickFormatter={(v: string) => v.slice(5, 10)}
            onHover={handleHover}
            onLeave={clear}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Verify the dev server starts cleanly**

```bash
npm run dev
```
Expected: no compile errors in terminal output.

- [ ] **Step 4: Manual smoke test on desktop**

Open `http://localhost:3000`, navigate to any route page. Verify:
- Charts render at full width with no horizontal scrollbar on desktop.
- Hovering the ForecastChart shows the tooltip strip with datetime, °C, mm, m/s, gust values.
- Hovering the WindPanel also updates the tooltip strip (it shows all five values).
- Moving off the chart area hides the strip.

- [ ] **Step 5: Manual smoke test on mobile (or DevTools mobile emulation)**

In Chrome DevTools, toggle mobile emulation (e.g. iPhone 12, 390px wide). Verify:
- Charts scroll horizontally by dragging; both charts scroll as one unit.
- Dragging a finger along a chart shows the tooltip strip above the chart area.
- The tooltip strip never obscures any chart content.

- [ ] **Step 6: Commit**

```bash
git add components/ForecastChart.tsx
git commit -m "feat: horizontal scroll + pinned tooltip strip on forecast charts"
```
