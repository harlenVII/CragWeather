# Day Range Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a segmented button control (7d / 10d / 14d / 16d) above the weather charts that controls how many days of forecast and history data are shown, persisted in `localStorage`.

**Architecture:** Always fetch 16 days in each direction from Open-Meteo. A new client component `WeatherView` owns the `days` state, reads/writes `localStorage`, slices the full weather data via a pure `sliceWeather` utility, and renders the button control + all chart sections. The existing chart components (`ForecastChart`, `WeatherChart`, `DailyCards`) are untouched.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Recharts, Vitest + Testing Library

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/weather.ts` | Modify | Change `past_days` and `forecast_days` from 7 → 16 |
| `lib/sliceWeather.ts` | Create | Pure function: slice full weather data to N-day window |
| `components/WeatherView.tsx` | Create | Client component: owns `days` state, renders picker + charts |
| `app/route/[id]/page.tsx` | Modify | Swap three `<section>` weather blocks for `<WeatherView>` |
| `app/globals.css` | Modify | Add `.day-picker-bar` and `.day-picker-btn` styles |
| `tests/lib/weather.test.ts` | Modify | Update `past_days`/`forecast_days` param assertions to "16" |
| `tests/components/RoutePage.test.tsx` | Modify | Update completeness-warning threshold from `14*24` → `32*24` |
| `tests/lib/sliceWeather.test.ts` | Create | Unit tests for `sliceWeather` |

---

## Task 1: Update fetchWeather to 16-day window

**Files:**
- Modify: `tests/lib/weather.test.ts:18-20` (param assertions)
- Modify: `tests/components/RoutePage.test.tsx:8,28,33` (completeness threshold)
- Modify: `lib/weather.ts:99-100` (past_days and forecast_days)

- [ ] **Step 1: Update param assertions in weather.test.ts**

In `tests/lib/weather.test.ts`, change the param checks in the first `it` block ("normalizes the Open-Meteo response for a non-NA route"):

```typescript
// old:
expect(url.searchParams.get("past_days")).toBe("7");
expect(url.searchParams.get("forecast_days")).toBe("7");

// new:
expect(url.searchParams.get("past_days")).toBe("16");
expect(url.searchParams.get("forecast_days")).toBe("16");
```

- [ ] **Step 2: Update completeness-warning threshold in RoutePage.test.tsx**

In `tests/components/RoutePage.test.tsx`, update all three occurrences of the 14-day window:

```typescript
// Line 8 — inline WeatherSection component:
// old: hourly.length < 14 * 24
// new: hourly.length < 32 * 24

// Line 27 — test description:
// old: "shows banner when hourly count is less than 336"
// new: "shows banner when hourly count is less than 768"

// Line 32 — test description:
// old: "does not show banner when hourly count is 336"
// new: "does not show banner when hourly count is 768"

// Lines 29, 34 — makeHourly calls:
// old: makeHourly(300) for below-threshold, makeHourly(336) for at-threshold
// new: makeHourly(700) for below-threshold, makeHourly(768) for at-threshold
```

The full updated file:

```typescript
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { HourlyWeather } from "@/lib/weather";

function WeatherSection({ hourly }: { hourly: HourlyWeather[] }) {
  return (
    <>
      {hourly.length < 32 * 24 && (
        <p className="weather-warning">
          Some weather data is unavailable — forecast may be incomplete.
        </p>
      )}
    </>
  );
}

const makeHourly = (n: number): HourlyWeather[] =>
  Array.from({ length: n }, (_, i) => ({
    datetime: `2026-01-01T${String(i % 24).padStart(2, "0")}:00`,
    temp: 10,
    precip: 0,
    windSpeed: 10,
    windGust: 15,
  }));

describe("WeatherSection — missing data banner", () => {
  it("shows banner when hourly count is less than 768", () => {
    render(<WeatherSection hourly={makeHourly(700)} />);
    expect(screen.getByText(/Some weather data is unavailable/)).toBeInTheDocument();
  });

  it("does not show banner when hourly count is 768", () => {
    render(<WeatherSection hourly={makeHourly(768)} />);
    expect(screen.queryByText(/Some weather data is unavailable/)).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npx vitest run tests/lib/weather.test.ts tests/components/RoutePage.test.tsx
```

Expected: two failures — param assertions see "7", threshold test passes at wrong value.

- [ ] **Step 4: Update fetchWeather in lib/weather.ts**

Change lines 99–100:

```typescript
// old:
url.searchParams.set("past_days", "7");
url.searchParams.set("forecast_days", "7");

// new:
url.searchParams.set("past_days", "16");
url.searchParams.set("forecast_days", "16");
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run tests/lib/weather.test.ts tests/components/RoutePage.test.tsx
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/weather.ts tests/lib/weather.test.ts tests/components/RoutePage.test.tsx
git commit -m "feat: fetch 16-day window from Open-Meteo (past_days=16, forecast_days=16)"
```

---

## Task 2: Implement sliceWeather pure utility

**Files:**
- Create: `tests/lib/sliceWeather.test.ts`
- Create: `lib/sliceWeather.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/sliceWeather.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { sliceWeather } from "@/lib/sliceWeather";
import type { DailyWeather, HourlyWeather } from "@/lib/weather";

function makeDaily(date: string): DailyWeather {
  return { date, tempMax: 20, tempMin: 10, precip: 0 };
}

function makeHourly(datetime: string): HourlyWeather {
  return { datetime, temp: 15, precip: 0, windSpeed: 3, windGust: 5 };
}

// 32-day window centred on 2026-05-15:
// days 0-15 → 2026-04-29 … 2026-05-14 (history)
// days 16-31 → 2026-05-15 … 2026-05-30 (today + forecast)
const TODAY = "2026-05-15";
const daily: DailyWeather[] = Array.from({ length: 32 }, (_, i) => {
  const d = new Date("2026-04-29T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + i);
  return makeDaily(d.toISOString().slice(0, 10));
});
const hourly: HourlyWeather[] = daily.flatMap(d =>
  Array.from({ length: 24 }, (_, h) =>
    makeHourly(`${d.date}T${String(h).padStart(2, "0")}:00`),
  ),
);
const weather = { daily, hourly };

describe("sliceWeather", () => {
  it("forecastDaily: includes exactly N days starting from today", () => {
    const { forecastDaily } = sliceWeather(weather, TODAY, 7);
    expect(forecastDaily).toHaveLength(7);
    expect(forecastDaily[0].date).toBe("2026-05-15");
    expect(forecastDaily[6].date).toBe("2026-05-21");
  });

  it("forecastDaily: excludes days before today", () => {
    const { forecastDaily } = sliceWeather(weather, TODAY, 7);
    expect(forecastDaily.every(d => d.date >= TODAY)).toBe(true);
  });

  it("historyDaily: includes exactly N days ending before today", () => {
    const { historyDaily } = sliceWeather(weather, TODAY, 7);
    expect(historyDaily).toHaveLength(7);
    expect(historyDaily[0].date).toBe("2026-05-08");
    expect(historyDaily[6].date).toBe("2026-05-14");
  });

  it("historyDaily: excludes today and later", () => {
    const { historyDaily } = sliceWeather(weather, TODAY, 7);
    expect(historyDaily.every(d => d.date < TODAY)).toBe(true);
  });

  it("forecastHourly: includes only hours in N forecast days", () => {
    const { forecastHourly } = sliceWeather(weather, TODAY, 7);
    expect(forecastHourly).toHaveLength(7 * 24);
    expect(forecastHourly[0].datetime).toBe("2026-05-15T00:00");
    expect(forecastHourly.every(h => h.datetime.slice(0, 10) >= TODAY)).toBe(true);
  });

  it("days=16 returns 16-day windows for both forecast and history", () => {
    const { forecastDaily, historyDaily } = sliceWeather(weather, TODAY, 16);
    expect(forecastDaily).toHaveLength(16);
    expect(historyDaily).toHaveLength(16);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/lib/sliceWeather.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/sliceWeather'".

- [ ] **Step 3: Implement sliceWeather**

Create `lib/sliceWeather.ts`:

```typescript
import type { DailyWeather, HourlyWeather } from "@/lib/weather";

export type SlicedWeather = {
  forecastHourly: HourlyWeather[];
  forecastDaily: DailyWeather[];
  historyDaily: DailyWeather[];
};

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function sliceWeather(
  weather: { daily: DailyWeather[]; hourly: HourlyWeather[] },
  today: string,
  days: number,
): SlicedWeather {
  const forecastEnd = addDays(today, days);
  const historyStart = addDays(today, -days);
  return {
    forecastHourly: weather.hourly.filter(h => {
      const d = h.datetime.slice(0, 10);
      return d >= today && d < forecastEnd;
    }),
    forecastDaily: weather.daily.filter(d => d.date >= today && d.date < forecastEnd),
    historyDaily: weather.daily.filter(d => d.date >= historyStart && d.date < today),
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/lib/sliceWeather.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/sliceWeather.ts tests/lib/sliceWeather.test.ts
git commit -m "feat: add sliceWeather utility for N-day window slicing"
```

---

## Task 3: Add CSS for day-picker buttons

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Append styles to globals.css**

Add the following at the end of `app/globals.css`:

```css
.day-picker-bar {
  display: flex;
  justify-content: flex-end;
  gap: 0.25rem;
  margin-bottom: 1rem;
}
.day-picker-btn {
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  background: var(--card);
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-size: 0.875rem;
  transition: border-color 0.1s, color 0.1s;
}
.day-picker-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.day-picker-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "feat: add day-picker button styles"
```

---

## Task 4: Build WeatherView component

**Files:**
- Create: `components/WeatherView.tsx`

- [ ] **Step 1: Create the component**

Create `components/WeatherView.tsx`:

```typescript
"use client";
import { useEffect, useState } from "react";
import { ForecastChart } from "@/components/ForecastChart";
import { WeatherChart } from "@/components/WeatherChart";
import { DailyCards } from "@/components/DailyCards";
import { sliceWeather } from "@/lib/sliceWeather";
import type { DailyWeather, HourlyWeather } from "@/lib/weather";

const DAY_OPTIONS = [7, 10, 14, 16] as const;
type DayOption = (typeof DAY_OPTIONS)[number];
const LS_KEY = "cragweather_days";

export function WeatherView({
  weather,
}: {
  weather: { daily: DailyWeather[]; hourly: HourlyWeather[] };
}) {
  const [days, setDays] = useState<DayOption>(7);

  useEffect(() => {
    const stored = Number(localStorage.getItem(LS_KEY));
    if ((DAY_OPTIONS as readonly number[]).includes(stored)) {
      setDays(stored as DayOption);
    }
  }, []);

  function handleDays(n: DayOption) {
    setDays(n);
    localStorage.setItem(LS_KEY, String(n));
  }

  const today = new Date().toISOString().slice(0, 10);
  const { forecastHourly, forecastDaily, historyDaily } = sliceWeather(weather, today, days);

  return (
    <>
      <div className="day-picker-bar">
        {DAY_OPTIONS.map(n => (
          <button
            key={n}
            type="button"
            className={`day-picker-btn${days === n ? " active" : ""}`}
            onClick={() => handleDays(n)}
          >
            {n}d
          </button>
        ))}
      </div>
      <section className="route-chart">
        <ForecastChart hourly={forecastHourly} />
      </section>
      <section className="route-cards">
        <DailyCards daily={forecastDaily} hourly={forecastHourly} />
      </section>
      <section className="route-chart route-chart-history">
        <h2 className="chart-section-title">Past {days} days</h2>
        <WeatherChart daily={historyDaily} />
      </section>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/WeatherView.tsx
git commit -m "feat: add WeatherView client component with day-range picker"
```

---

## Task 5: Wire WeatherView into the route page

**Files:**
- Modify: `app/route/[id]/page.tsx`

- [ ] **Step 1: Update page.tsx**

Replace the content of `app/route/[id]/page.tsx` with:

```typescript
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WeatherView } from "@/components/WeatherView";

type ApiResponse = {
  route: {
    id: number; name: string; slug: string;
    area: string | null; grade: string | null;
    lat: number; lng: number; mpUrl: string;
  };
  weather: {
    daily: import("@/lib/weather").DailyWeather[];
    hourly: import("@/lib/weather").HourlyWeather[];
  } | null;
};

async function getRoute(id: string): Promise<ApiResponse | null> {
  const h = await headers();
  const host = h.get("host")!;
  const proto = h.get("x-forwarded-proto") ?? "http";
  const res = await fetch(`${proto}://${host}/api/route/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (res.status === 502) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "route_unavailable");
  }
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return (await res.json()) as ApiResponse;
}

export default async function RoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getRoute(id);
  if (!data) notFound();

  const { route, weather } = data;

  return (
    <main className="route-page">
      <header className="route-header">
        <h1>{route.name}</h1>
        <p className="route-meta">
          {route.area && <span>{route.area}</span>}
          {route.grade && <span> · {route.grade}</span>}
        </p>
        <p>
          <a href={route.mpUrl} target="_blank" rel="noreferrer">
            View on Mountain Project ↗
          </a>
        </p>
      </header>

      {weather ? (
        <>
          {weather.hourly.length < 32 * 24 && (
            <p className="weather-warning">
              Some weather data is unavailable — forecast may be incomplete.
            </p>
          )}
          <WeatherView weather={weather} />
        </>
      ) : (
        <p className="weather-unavailable">Weather unavailable. Please refresh.</p>
      )}

      <footer className="route-footer">
        <Link href="/">← Search another route</Link>
      </footer>
    </main>
  );
}
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Run the dev server and manually verify**

```bash
npm run dev
```

Open a route page (e.g. `http://localhost:3000/route/105748131`).

Check:
- [ ] `7d` button is active by default
- [ ] Clicking `10d` updates both the forecast chart and the "Past 10 days" history heading
- [ ] Clicking `16d` shows a longer forecast and "Past 16 days"
- [ ] Refreshing the page restores the last-selected value (localStorage persisted)
- [ ] Active button is visually highlighted; others are muted

- [ ] **Step 4: Commit**

```bash
git add app/route/[id]/page.tsx
git commit -m "feat: wire WeatherView into route page, replace inline weather sections"
```
