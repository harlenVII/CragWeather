# Multi-Model Weather Stitching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single Open-Meteo model call with a stitched HRRR→NAM→GFS call for North American routes, tagging each day card with the model that provided its data.

**Architecture:** `fetchWeather` detects North American coordinates via bounding box and makes a single multi-model Open-Meteo call (`models=hrrr,nam_conus,gfs_global`). `stitchModels` picks the first non-null model per time slot in priority order. The `model` field flows through `WeatherResponse` to `DailyCards` where it renders as a small badge. Non-NA routes use the existing no-model call and show no badge.

**Tech Stack:** TypeScript, Open-Meteo API, MSW (test HTTP mocking), Vitest, React

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/weather.ts` | Modify | Types, `isNorthAmerica`, `stitchModels`, updated `fetchWeather` |
| `tests/lib/weather.test.ts` | Modify | Unit tests for `isNorthAmerica`, `stitchModels`, `fetchWeather` |
| `components/DailyCards.tsx` | Modify | Render model badge per day card |
| `tests/components/DailyCards.test.tsx` | Modify | Test badge presence/absence |

---

### Task 1: Add `model` to weather types [model: haiku]

**Files:**
- Modify: `lib/weather.ts:1-3`

- [ ] **Step 1: Update types in `lib/weather.ts`**

Replace lines 1–3 with:

```ts
export type DailyWeather  = { date: string; tempMax: number; tempMin: number; precip: number; model?: string };
export type HourlyWeather = { datetime: string; temp: number; precip: number; model?: string };
export type WeatherResponse = { daily: DailyWeather[]; hourly: HourlyWeather[] };
```

- [ ] **Step 2: Run existing tests to verify nothing breaks**

```bash
npx vitest run tests/lib/weather.test.ts tests/components/DailyCards.test.tsx
```

Expected: all existing tests pass (`model` is optional — no breaking changes).

- [ ] **Step 3: Commit**

```bash
git add lib/weather.ts
git commit -m "feat: add optional model field to DailyWeather and HourlyWeather types"
```

---

### Task 2: Add `isNorthAmerica` helper [model: haiku]

**Files:**
- Modify: `lib/weather.ts` (add helper before `fetchWeather`)
- Modify: `tests/lib/weather.test.ts` (add describe block)

- [ ] **Step 1: Write failing test**

Add this import and describe block at the top of `tests/lib/weather.test.ts`, after the existing imports:

```ts
import { fetchWeather, isNorthAmerica } from "@/lib/weather";

describe("isNorthAmerica", () => {
  it("returns true for Yosemite, CA (CONUS)", () => {
    expect(isNorthAmerica(37.73, -119.64)).toBe(true);
  });
  it("returns true for Squamish, BC (Canada)", () => {
    expect(isNorthAmerica(49.7, -123.15)).toBe(true);
  });
  it("returns true for El Potrero Chico, Mexico", () => {
    expect(isNorthAmerica(26.87, -100.47)).toBe(true);
  });
  it("returns false for Chamonix, France", () => {
    expect(isNorthAmerica(45.92, 6.87)).toBe(false);
  });
  it("returns false for Kalymnos, Greece", () => {
    expect(isNorthAmerica(36.95, 26.98)).toBe(false);
  });
});
```

(The existing `import { fetchWeather } from "@/lib/weather"` at line 6 should be merged into this new import line.)

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lib/weather.test.ts
```

Expected: FAIL — `isNorthAmerica is not exported from @/lib/weather`.

- [ ] **Step 3: Implement `isNorthAmerica` in `lib/weather.ts`**

Add this before `fetchWeather`:

```ts
export function isNorthAmerica(lat: number, lng: number): boolean {
  return lat >= 7 && lat <= 84 && lng >= -169 && lng <= -52;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/weather.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/weather.ts tests/lib/weather.test.ts
git commit -m "feat: add isNorthAmerica bounding box helper"
```

---

### Task 3: Add `stitchModels` function [model: sonnet]

**Files:**
- Modify: `lib/weather.ts` (add `OmHourlyResponse` type and `stitchModels`)
- Modify: `tests/lib/weather.test.ts` (add stitchModels describe block)

- [ ] **Step 1: Add `OmHourlyResponse` type to `lib/weather.ts`**

Add this type after the existing `OmResponse` type (leave `OmResponse` unchanged — it is still used for the non-NA single-model path):

```ts
type OmHourlyResponse = {
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
    precipitation: (number | null)[];
  };
};
```

- [ ] **Step 2: Write failing tests for `stitchModels`**

Add this import update and describe block to `tests/lib/weather.test.ts`:

```ts
import { fetchWeather, isNorthAmerica, stitchModels } from "@/lib/weather";

// Helper: build a minimal OmHourlyResponse for testing stitchModels.
// Index i maps to 2026-05-01T{HH}:00 where HH = i % 24, day = floor(i/24)+1.
function makeOm(temps: (number | null)[], precips: (number | null)[]) {
  return {
    hourly: {
      time: temps.map((_, i) => {
        const day = String(Math.floor(i / 24) + 1).padStart(2, "0");
        const hr  = String(i % 24).padStart(2, "0");
        return `2026-05-${day}T${hr}:00`;
      }),
      temperature_2m: temps,
      precipitation: precips,
    },
  };
}

describe("stitchModels", () => {
  it("hourly: picks HRRR when it has data", () => {
    const result = stitchModels(
      [makeOm([20], [0]), makeOm([18], [0]), makeOm([16], [0])],
      ["HRRR", "NAM", "GFS"],
    );
    expect(result.hourly[0].temp).toBe(20);
    expect(result.hourly[0].model).toBe("HRRR");
  });

  it("hourly: falls through to NAM when HRRR slot is null", () => {
    const result = stitchModels(
      [makeOm([null], [null]), makeOm([18], [0]), makeOm([16], [0])],
      ["HRRR", "NAM", "GFS"],
    );
    expect(result.hourly[0].temp).toBe(18);
    expect(result.hourly[0].model).toBe("NAM");
  });

  it("hourly: falls through to GFS when HRRR and NAM are both null", () => {
    const result = stitchModels(
      [makeOm([null], [null]), makeOm([null], [null]), makeOm([16], [0.5])],
      ["HRRR", "NAM", "GFS"],
    );
    expect(result.hourly[0].temp).toBe(16);
    expect(result.hourly[0].model).toBe("GFS");
  });

  it("hourly: omits slots where all models are null", () => {
    const result = stitchModels(
      [makeOm([null, 20], [null, 0]), makeOm([null, 18], [null, 0]), makeOm([null, 16], [null, 0])],
      ["HRRR", "NAM", "GFS"],
    );
    expect(result.hourly).toHaveLength(1);
    expect(result.hourly[0].model).toBe("HRRR");
  });

  it("daily: derives tempMax, tempMin, precip from stitched hourly entries", () => {
    // 2 hourly entries in the same day (2026-05-01T00 and T01)
    const result = stitchModels(
      [makeOm([10, 20], [0.5, 0.5]), makeOm([8, 18], [0, 0]), makeOm([6, 16], [0, 0])],
      ["HRRR", "NAM", "GFS"],
    );
    expect(result.daily).toHaveLength(1);
    expect(result.daily[0].date).toBe("2026-05-01");
    expect(result.daily[0].tempMax).toBe(20);
    expect(result.daily[0].tempMin).toBe(10);
    expect(result.daily[0].precip).toBeCloseTo(1.0);
    expect(result.daily[0].model).toBe("HRRR");
  });

  it("daily: badge shows majority model when a day straddles the HRRR cutoff", () => {
    // 4 hourly entries in 2026-05-01: slot 0 from HRRR, slots 1-3 from NAM
    const result = stitchModels(
      [makeOm([20, null, null, null], [0, null, null, null]), makeOm([null, 18, 18, 18], [null, 0, 0, 0]), makeOm([16, 16, 16, 16], [0, 0, 0, 0])],
      ["HRRR", "NAM", "GFS"],
    );
    expect(result.daily[0].model).toBe("NAM"); // 3 NAM hours vs 1 HRRR hour
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/lib/weather.test.ts
```

Expected: FAIL — `stitchModels is not exported`.

- [ ] **Step 4: Implement `stitchModels` in `lib/weather.ts`**

Add after `isNorthAmerica` and before `fetchWeather`:

```ts
export function stitchModels(responses: OmHourlyResponse[], names: string[]): WeatherResponse {
  const hlen = responses[0].hourly.time.length;
  const hourly: HourlyWeather[] = [];
  for (let i = 0; i < hlen; i++) {
    for (let m = 0; m < responses.length; m++) {
      const r = responses[m];
      if (r.hourly.temperature_2m[i] != null) {
        hourly.push({
          datetime: r.hourly.time[i],
          temp: r.hourly.temperature_2m[i]!,
          precip: r.hourly.precipitation[i] ?? 0,
          model: names[m],
        });
        break;
      }
    }
  }

  const dayMap = new Map<string, HourlyWeather[]>();
  for (const h of hourly) {
    const date = h.datetime.slice(0, 10);
    if (!dayMap.has(date)) dayMap.set(date, []);
    dayMap.get(date)!.push(h);
  }

  const daily: DailyWeather[] = [];
  for (const [date, hours] of dayMap) {
    const modelCounts = new Map<string, number>();
    for (const h of hours) {
      if (h.model) modelCounts.set(h.model, (modelCounts.get(h.model) ?? 0) + 1);
    }
    const model = [...modelCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    daily.push({
      date,
      tempMax: Math.max(...hours.map(h => h.temp)),
      tempMin: Math.min(...hours.map(h => h.temp)),
      precip: hours.reduce((s, h) => s + h.precip, 0),
      model,
    });
  }

  return { daily, hourly };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/lib/weather.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/weather.ts tests/lib/weather.test.ts
git commit -m "feat: add stitchModels — derives daily from stitched hourly, correct at model boundaries"
```

---

### Task 4: Update `fetchWeather` for multi-model NA call [model: sonnet]

**Files:**
- Modify: `lib/weather.ts` (update `fetchWeather`)
- Modify: `tests/lib/weather.test.ts` (add integration tests inside existing `describe("fetchWeather")`)

> **Verify API shape first.** Open-Meteo's multi-model response structure must be confirmed before implementing. Run this curl and inspect the output:
>
> ```bash
> curl -s "https://api.open-meteo.com/v1/forecast?latitude=37.73&longitude=-119.64&past_days=1&forecast_days=2&hourly=temperature_2m,precipitation&timezone=auto&models=hrrr,nam_conus,gfs_global" | jq 'if type == "array" then "ARRAY of \(length) objects" else "SINGLE object — keys: \(keys)" end'
> ```
>
> - If output is **`"ARRAY of 3 objects"`**: the code below is correct as-is.
> - If output is **`"SINGLE object — keys: ..."`** with prefixed field names (e.g. `temperature_2m_hrrr`): `fetchWeather` must build three `OmHourlyResponse` objects by extracting the prefixed fields. `stitchModels` and its tests stay unchanged.
> - If `gfs_global` is rejected, retry with `gfs_seamless`. Update the model ID string in both `fetchWeather` and the integration test.

- [ ] **Step 1: Write failing integration tests**

Add inside the existing `describe("fetchWeather")` block in `tests/lib/weather.test.ts`, after the existing `it` blocks:

```ts
// Multi-model fixture: array of 3 OmHourlyResponse objects (no daily field).
// HRRR: first 48 hourly slots have data, rest null.
// NAM: first 96 hourly slots have data, rest null.
// GFS: all 336 hours have data (reuse fixture.hourly).
const multiFixture = [
  {
    hourly: {
      time: fixture.hourly.time,
      temperature_2m: Array.from({ length: 14 * 24 }, (_, i) => i < 48 ? 15 : null),
      precipitation:  Array.from({ length: 14 * 24 }, (_, i) => i < 48 ? 0  : null),
    },
  },
  {
    hourly: {
      time: fixture.hourly.time,
      temperature_2m: Array.from({ length: 14 * 24 }, (_, i) => i < 96 ? 13 : null),
      precipitation:  Array.from({ length: 14 * 24 }, (_, i) => i < 96 ? 0  : null),
    },
  },
  {
    hourly: fixture.hourly,
  },
];

it("sends models param, omits daily param, and stitches hourly for a CONUS route", async () => {
  server.use(
    http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("models")).toBe("hrrr,nam_conus,gfs_global");
      expect(url.searchParams.get("daily")).toBeNull();
      expect(url.searchParams.get("latitude")).toBe("37.73");
      return HttpResponse.json(multiFixture);
    }),
  );
  const w = await fetchWeather(37.73, -119.64);
  expect(w.daily).toHaveLength(14);
  // Days 0-1 (indices 0-47 hourly): HRRR
  expect(w.daily[0].model).toBe("HRRR");
  // Days 2-3 (indices 48-95 hourly): NAM
  expect(w.daily[2].model).toBe("NAM");
  // Days 4-13 (indices 96+ hourly): GFS
  expect(w.daily[4].model).toBe("GFS");
  expect(w.hourly[0].model).toBe("HRRR");
  expect(w.hourly[48].model).toBe("NAM");
  expect(w.hourly[96].model).toBe("GFS");
});

it("sends models param for a Canadian route (graceful NAM→GFS degradation)", async () => {
  server.use(
    http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("models")).toBe("hrrr,nam_conus,gfs_global");
      return HttpResponse.json(multiFixture);
    }),
  );
  const w = await fetchWeather(49.7, -123.15); // Squamish, BC
  expect(w.daily[0]).toBeDefined();
});

it("does NOT set models param for a non-North-American route", async () => {
  server.use(
    http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("models")).toBeNull();
      expect(url.searchParams.get("daily")).toBe("temperature_2m_max,temperature_2m_min,precipitation_sum");
      return HttpResponse.json(fixture);
    }),
  );
  const w = await fetchWeather(45.92, 6.87); // Chamonix, France
  expect(w.daily[0].model).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/weather.test.ts
```

Expected: FAIL — `fetchWeather` does not yet set `models` param or omit `daily`.

- [ ] **Step 3: Update `fetchWeather` in `lib/weather.ts`**

Replace the full `fetchWeather` function:

```ts
export async function fetchWeather(
  lat: number,
  lng: number,
  fetcher: typeof fetch = fetch,
): Promise<WeatherResponse> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("past_days", "7");
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("hourly", "temperature_2m,precipitation");
  url.searchParams.set("timezone", "auto");

  const na = isNorthAmerica(lat, lng);
  if (na) {
    url.searchParams.set("models", "hrrr,nam_conus,gfs_global");
    // No daily param — daily values are derived from stitched hourly in stitchModels
  } else {
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum");
  }

  const res = await fetcher(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);

  if (na) {
    const responses: OmHourlyResponse[] = await res.json();
    return stitchModels(responses, ["HRRR", "NAM", "GFS"]);
  }

  const j: OmResponse = await res.json();
  const daily = j.daily.time.map((t, i) => ({
    date: t,
    tempMax: j.daily.temperature_2m_max[i] as number,
    tempMin: j.daily.temperature_2m_min[i] as number,
    precip: j.daily.precipitation_sum[i] ?? 0,
  }));
  const hourly = j.hourly.time.map((t, i) => ({
    datetime: t,
    temp: j.hourly.temperature_2m[i] as number,
    precip: j.hourly.precipitation[i] ?? 0,
  }));
  return { daily, hourly };
}
```

- [ ] **Step 4: Run all weather tests**

```bash
npx vitest run tests/lib/weather.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/weather.ts tests/lib/weather.test.ts
git commit -m "feat: use HRRR→NAM→GFS multi-model stitching for North American routes"
```

---

### Task 5: Add model badge to DailyCards [model: haiku]

**Files:**
- Modify: `components/DailyCards.tsx`
- Modify: `tests/components/DailyCards.test.tsx`

- [ ] **Step 1: Write failing tests**

Add these two `it` blocks to the existing `describe("DailyCards")` in `tests/components/DailyCards.test.tsx`:

```ts
it("shows model badge when day.model is set", () => {
  const daily: DailyWeather[] = [{ date: "2026-01-01", tempMax: 12, tempMin: 2, precip: 1, model: "HRRR" }];
  render(<DailyCards daily={daily} hourly={[]} />);
  expect(screen.getByText("HRRR")).toBeInTheDocument();
});

it("does not render a model badge when model is undefined", () => {
  const daily = [day("2026-01-01", 12, 2, 1)]; // helper from top of file — no model field
  render(<DailyCards daily={daily} hourly={[]} />);
  expect(screen.queryByText("HRRR")).toBeNull();
  expect(screen.queryByText("NAM")).toBeNull();
  expect(screen.queryByText("GFS")).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/DailyCards.test.tsx
```

Expected: FAIL — no badge element in DOM yet.

- [ ] **Step 3: Add badge to `components/DailyCards.tsx`**

Inside the `<button>` element, after `<div className="card-precip">`, add:

```tsx
{d.model && (
  <div className="card-model">{d.model}</div>
)}
```

Full updated file:

```tsx
"use client";
import { useState } from "react";
import type { DailyWeather, HourlyWeather } from "@/lib/weather";

export function DailyCards({
  daily,
  hourly,
}: {
  daily: DailyWeather[];
  hourly: HourlyWeather[];
}) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  return (
    <div className="cards-row">
      {daily.map((d) => {
        const isOpen = d.date === openDate;
        const dayHourly = hourly.filter((h) => h.datetime.startsWith(d.date));
        return (
          <div key={d.date} className="card-cell">
            <button
              type="button"
              className={`card${isOpen ? " card-open" : ""}`}
              onClick={() => setOpenDate(isOpen ? null : d.date)}
              aria-expanded={isOpen}
            >
              <div className="card-date">{d.date.slice(5)}</div>
              <div className="card-temps">
                <span className="hi">{Math.round(d.tempMax)}°</span>
                <span className="lo">{Math.round(d.tempMin)}°</span>
              </div>
              <div className="card-precip">{d.precip.toFixed(1)} mm</div>
              {d.model && (
                <div className="card-model">{d.model}</div>
              )}
            </button>
            {isOpen && (
              <ul className="hourly-list">
                {dayHourly.map((h) => (
                  <li key={h.datetime}>
                    <span>{h.datetime.slice(11, 16)}</span>
                    <span>{Math.round(h.temp)}°</span>
                    <span>{h.precip.toFixed(1)} mm</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run DailyCards tests**

```bash
npx vitest run tests/components/DailyCards.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/DailyCards.tsx tests/components/DailyCards.test.tsx
git commit -m "feat: show model badge on day cards for North American routes"
```
