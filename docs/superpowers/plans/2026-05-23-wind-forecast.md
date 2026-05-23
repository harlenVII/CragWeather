# Wind Forecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a wind speed + gust panel below the hourly forecast chart (`ForecastChart`) using Open-Meteo's `wind_speed_10m` and `wind_gusts_10m` fields.

**Architecture:** Extend `HourlyWeather` with `windSpeed`/`windGust`, request those fields from Open-Meteo in both the NA multi-model path and the non-NA path, carry wind through `stitchModels`, then render a shared `WindPanel` component below `ForecastChart`. History chart (`WeatherChart`) and daily cards are untouched.

**Tech Stack:** TypeScript, Next.js 14 (app router), Recharts, Vitest + MSW, Open-Meteo REST API.

---

## File Map

| File | Change |
|------|--------|
| `tests/fixtures/open-meteo.json` | Add `wind_speed_10m` and `wind_gusts_10m` arrays to `hourly` |
| `lib/weather.ts` | Add wind to types, API params, `stitchModels`, non-NA mapping |
| `tests/lib/weather.test.ts` | Update `makeOm` helper, `multiFixture`, add wind assertions |
| `components/WindPanel.tsx` | New — renders speed line + gust bar chart |
| `components/ForecastChart.tsx` | Import and render `WindPanel` below main chart |

---

## Task 1: Add wind fields to fixture and `HourlyWeather` type

**Files:**
- Modify: `tests/fixtures/open-meteo.json`
- Modify: `lib/weather.ts:1-3`

- [ ] **Step 1: Add wind arrays to the hourly fixture**

Run this script from the repo root to inject the wind fields (all 336 slots set to constant values):

```bash
node -e "
const fs = require('fs');
const f = JSON.parse(fs.readFileSync('tests/fixtures/open-meteo.json', 'utf8'));
const n = f.hourly.time.length;
f.hourly.wind_speed_10m = Array(n).fill(12);
f.hourly.wind_gusts_10m = Array(n).fill(22);
fs.writeFileSync('tests/fixtures/open-meteo.json', JSON.stringify(f, null, 2));
console.log('done, slots:', n);
"
```

Expected output: `done, slots: 336`

- [ ] **Step 2: Add wind fields to `HourlyWeather` type**

In `lib/weather.ts`, change line 2:

```ts
// before
export type HourlyWeather = { datetime: string; temp: number; precip: number; model?: string };

// after
export type HourlyWeather = { datetime: string; temp: number; precip: number; windSpeed: number; windGust: number; model?: string };
```

- [ ] **Step 3: Run tests to see what fails**

```bash
npm test
```

Expected: existing tests fail because `HourlyWeather` objects constructed in `lib/weather.ts` no longer satisfy the type (TypeScript transpile may warn; runtime will show `windSpeed: undefined`). This guides the next tasks.

- [ ] **Step 4: Commit types and fixture**

```bash
git add tests/fixtures/open-meteo.json lib/weather.ts
git commit -m "feat: add windSpeed/windGust to HourlyWeather type and fixture"
```

---

## Task 2: Non-NA path — fetch and normalize wind

**Files:**
- Modify: `lib/weather.ts` (non-NA section ~lines 85–136)
- Modify: `tests/lib/weather.test.ts`

- [ ] **Step 1: Write a failing test**

Add this test inside `describe("fetchWeather", ...)` in `tests/lib/weather.test.ts`, after the existing "normalizes the Open-Meteo response for a non-NA route" test:

```ts
it("includes windSpeed and windGust in hourly for a non-NA route", async () => {
  server.use(
    http.get("https://api.open-meteo.com/v1/forecast", () =>
      HttpResponse.json(fixture),
    ),
  );
  const w = await fetchWeather(45.92, 6.87);
  expect(typeof w.hourly[0].windSpeed).toBe("number");
  expect(typeof w.hourly[0].windGust).toBe("number");
  expect(w.hourly[0].windSpeed).toBe(12);
  expect(w.hourly[0].windGust).toBe(22);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/lib/weather.test.ts
```

Expected: FAIL — `expected "undefined" to be "number"`.

- [ ] **Step 3: Update `OmResponse` type to include hourly wind fields**

In `lib/weather.ts`, update the `OmResponse` type (around line 5):

```ts
type OmResponse = {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
  };
};
```

- [ ] **Step 4: Add wind to the hourly API param (shared by both paths)**

In `lib/weather.ts`, find the line:
```ts
url.searchParams.set("hourly", "temperature_2m,precipitation");
```
Change it to:
```ts
url.searchParams.set("hourly", "temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m");
```

- [ ] **Step 5: Map wind fields in the non-NA hourly array**

In `lib/weather.ts`, find the non-NA hourly mapping (around line 131):

```ts
// before
const hourly = j.hourly.time.map((t, i) => ({
  datetime: t,
  temp: j.hourly.temperature_2m[i] as number,
  precip: j.hourly.precipitation[i] ?? 0,
}));

// after
const hourly = j.hourly.time.map((t, i) => ({
  datetime: t,
  temp: j.hourly.temperature_2m[i] as number,
  precip: j.hourly.precipitation[i] ?? 0,
  windSpeed: j.hourly.wind_speed_10m[i] ?? 0,
  windGust: j.hourly.wind_gusts_10m[i] ?? 0,
}));
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
npx vitest run tests/lib/weather.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/weather.ts tests/lib/weather.test.ts
git commit -m "feat: fetch and normalize wind speed/gust for non-NA routes"
```

---

## Task 3: NA multi-model path — extract and stitch wind

**Files:**
- Modify: `lib/weather.ts` (`OmHourlyResponse`, `stitchModels`, `fetchWeather` NA block)
- Modify: `tests/lib/weather.test.ts` (`makeOm`, `multiFixture`, new tests)

- [ ] **Step 1: Write a failing test for `stitchModels` wind carry**

In `tests/lib/weather.test.ts`, update `makeOm` to accept optional wind params:

```ts
function makeOm(
  temps: (number | null)[],
  precips: (number | null)[],
  windSpeeds?: (number | null)[],
  windGusts?: (number | null)[],
) {
  return {
    hourly: {
      time: temps.map((_, i) => {
        const day = String(Math.floor(i / 24) + 1).padStart(2, "0");
        const hr  = String(i % 24).padStart(2, "0");
        return `2026-05-${day}T${hr}:00`;
      }),
      temperature_2m: temps,
      precipitation: precips,
      wind_speed_10m: windSpeeds ?? temps.map(() => null),
      wind_gusts_10m: windGusts ?? temps.map(() => null),
    },
  };
}
```

Then add this test inside `describe("stitchModels", ...)`:

```ts
it("hourly: carries windSpeed and windGust from the winning model", () => {
  const result = stitchModels(
    [
      makeOm([null], [null], [null], [null]),
      makeOm([18], [0], [25], [35]),
      makeOm([16], [0], [20], [30]),
    ],
    ["HRRR", "NAM", "GFS"],
  );
  expect(result.hourly[0].windSpeed).toBe(25);
  expect(result.hourly[0].windGust).toBe(35);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/lib/weather.test.ts
```

Expected: FAIL — `expected undefined to be 25`.

- [ ] **Step 3: Update `OmHourlyResponse` type**

In `lib/weather.ts`, update `OmHourlyResponse` (around line 19):

```ts
type OmHourlyResponse = {
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
    precipitation: (number | null)[];
    wind_speed_10m: (number | null)[];
    wind_gusts_10m: (number | null)[];
  };
};
```

- [ ] **Step 4: Carry wind fields in `stitchModels`**

In `lib/weather.ts`, find the push inside the stitchModels loop (around line 49):

```ts
// before
hourly.push({
  datetime: r.hourly.time[i],
  temp: r.hourly.temperature_2m[i]!,
  precip: r.hourly.precipitation[i] ?? 0,
  model: names[m],
});

// after
hourly.push({
  datetime: r.hourly.time[i],
  temp: r.hourly.temperature_2m[i]!,
  precip: r.hourly.precipitation[i] ?? 0,
  windSpeed: r.hourly.wind_speed_10m[i] ?? 0,
  windGust: r.hourly.wind_gusts_10m[i] ?? 0,
  model: names[m],
});
```

- [ ] **Step 5: Run stitchModels tests to verify they pass**

```bash
npx vitest run tests/lib/weather.test.ts
```

Expected: all `stitchModels` tests PASS.

- [ ] **Step 6: Add wind fields to `multiFixture` in the test file**

In `tests/lib/weather.test.ts`, extend `multiFixture` to include wind prefixed arrays. Find the `multiFixture` const (around line 55) and add six new arrays:

```ts
const multiFixture = {
  hourly: {
    time: fixture.hourly.time,
    temperature_2m_ncep_hrrr_conus: Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 216 ? 15 : null),
    precipitation_ncep_hrrr_conus:  Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 216 ? 0  : null),
    wind_speed_10m_ncep_hrrr_conus: Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 216 ? 20 : null),
    wind_gusts_10m_ncep_hrrr_conus: Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 216 ? 30 : null),
    temperature_2m_ncep_nam_conus:  Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 264 ? 13 : null),
    precipitation_ncep_nam_conus:   Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 264 ? 0  : null),
    wind_speed_10m_ncep_nam_conus:  Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 264 ? 15 : null),
    wind_gusts_10m_ncep_nam_conus:  Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 264 ? 25 : null),
    temperature_2m_gfs_global:      fixture.hourly.temperature_2m,
    precipitation_gfs_global:       fixture.hourly.precipitation,
    wind_speed_10m_gfs_global:      Array.from({ length: 14 * 24 }, () => 10),
    wind_gusts_10m_gfs_global:      Array.from({ length: 14 * 24 }, () => 18),
  },
};
```

- [ ] **Step 7: Write a failing test for NA wind extraction**

Add inside `describe("fetchWeather", ...)`:

```ts
it("includes windSpeed and windGust in hourly for an NA route", async () => {
  server.use(
    http.get("https://api.open-meteo.com/v1/forecast", () =>
      HttpResponse.json(multiFixture),
    ),
  );
  const w = await fetchWeather(37.73, -119.64);
  expect(typeof w.hourly[0].windSpeed).toBe("number");
  // slot 168 is first HRRR slot: speed=20, gust=30
  expect(w.hourly[168].windSpeed).toBe(20);
  expect(w.hourly[168].windGust).toBe(30);
});
```

- [ ] **Step 8: Run the test to verify it fails**

```bash
npx vitest run tests/lib/weather.test.ts
```

Expected: FAIL — NA wind extraction not yet wired in `fetchWeather`.

- [ ] **Step 9: Extract wind fields in `fetchWeather` NA block**

In `lib/weather.ts`, find the NA `responses` mapping (around line 113):

```ts
// before
const responses: OmHourlyResponse[] = NA_MODELS.map(m => ({
  hourly: {
    time: j.hourly.time as string[],
    temperature_2m: j.hourly[`temperature_2m_${m.id}`] as (number | null)[],
    precipitation:  j.hourly[`precipitation_${m.id}`]  as (number | null)[],
  },
}));

// after
const responses: OmHourlyResponse[] = NA_MODELS.map(m => ({
  hourly: {
    time: j.hourly.time as string[],
    temperature_2m:  j.hourly[`temperature_2m_${m.id}`]  as (number | null)[],
    precipitation:   j.hourly[`precipitation_${m.id}`]   as (number | null)[],
    wind_speed_10m:  j.hourly[`wind_speed_10m_${m.id}`]  as (number | null)[],
    wind_gusts_10m:  j.hourly[`wind_gusts_10m_${m.id}`]  as (number | null)[],
  },
}));
```

- [ ] **Step 10: Run all tests to verify they pass**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 11: Commit**

```bash
git add lib/weather.ts tests/lib/weather.test.ts
git commit -m "feat: extract and stitch wind speed/gust for NA multi-model routes"
```

---

## Task 4: Create `WindPanel` component

**Files:**
- Create: `components/WindPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface WindPanelProps {
  data: { x: string; speed: number; gust: number }[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
}

export function WindPanel({ data, ticks, tickFormatter }: WindPanelProps) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <ComposedChart data={data} margin={{ top: 8, right: 32, bottom: 16, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="x" ticks={ticks} tickFormatter={tickFormatter} />
        <YAxis label={{ value: "km/h", angle: -90, position: "insideLeft" }} />
        <Tooltip labelFormatter={(v: string) => v.replace("T", " ")} />
        <Legend />
        <Bar dataKey="gust" name="Gust (km/h)" fill="#93c5fd" fillOpacity={0.6} />
        <Line dataKey="speed" name="Speed (km/h)" stroke="#2563eb" strokeWidth={2} dot={false} />
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
git commit -m "feat: add WindPanel component for wind speed and gust chart"
```

---

## Task 5: Wire `WindPanel` into `ForecastChart`

**Files:**
- Modify: `components/ForecastChart.tsx`

- [ ] **Step 1: Update `ForecastChart` to import and render `WindPanel`**

Replace the entire content of `components/ForecastChart.tsx` with:

```tsx
"use client";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HourlyWeather } from "@/lib/weather";
import { WindPanel } from "@/components/WindPanel";

type Section = { model: string; start: string; end: string };

function buildSections(hourly: HourlyWeather[]): Section[] {
  const sections: Section[] = [];
  for (const h of hourly) {
    if (!h.model) continue;
    const last = sections.at(-1);
    if (!last || last.model !== h.model) {
      sections.push({ model: h.model, start: h.datetime, end: h.datetime });
    } else {
      last.end = h.datetime;
    }
  }
  return sections;
}

export function ForecastChart({ hourly }: { hourly: HourlyWeather[] }) {
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

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 24, right: 32, bottom: 16, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis
            dataKey="datetime"
            ticks={dayTicks}
            tickFormatter={(v: string) => v.slice(5, 10)}
          />
          <YAxis yAxisId="precip" orientation="left" label={{ value: "mm", angle: -90, position: "insideLeft" }} />
          <YAxis yAxisId="temp" orientation="right" label={{ value: "°C", angle: 90, position: "insideRight" }} />
          <Tooltip labelFormatter={(v: string) => v.replace("T", " ")} />
          <Legend />

          {sections.map(s => (
            <ReferenceArea
              key={`area-${s.start}`}
              x1={s.start}
              x2={s.end}
              yAxisId="temp"
              label={{ value: s.model, position: "insideTopLeft", fill: "#6b7280", fontSize: 11, fontWeight: 500 }}
              fillOpacity={0}
              strokeOpacity={0}
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
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 4: Start dev server and visually verify**

```bash
npm run dev
```

Open `http://localhost:3000` and navigate to any route page. Verify:
- The forecast section shows the existing temp/precip chart (unchanged).
- A wind chart appears directly below it with day-boundary ticks aligned to the main chart.
- The wind chart shows "Gust (km/h)" as semi-transparent blue bars and "Speed (km/h)" as a solid blue line.
- The Y-axis is labeled "km/h".
- Hovering shows a tooltip with speed and gust values.

- [ ] **Step 5: Commit**

```bash
git add components/ForecastChart.tsx
git commit -m "feat: render wind speed and gust panel below forecast chart"
```
