# Forecast Panel Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add humidity, feels-like, dew point and chance-of-precipitation to the hourly forecast, restructured as four stacked panels sharing one x-axis and one hover state.

**Architecture:** `lib/weather.ts` swaps stitch tier 3 from `gfs_global` to `gfs_seamless` and carries three new fields through the existing winning-model walk. Chance-of-precipitation bypasses the stitcher entirely — it is read positionally from the seamless column, because Open-Meteo serves one ensemble product under every model prefix. `ForecastChart` becomes a pure coordinator (hover state, ticks, weekend bands, model sections, tooltip strip) rendering four sibling panels that all share `WindPanel`'s existing props shape.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Recharts, Vitest + Testing Library + jsdom, MSW, Drizzle/Postgres.

**Spec:** `docs/superpowers/specs/2026-09-04-forecast-panel-stack-design.md`

## Global Constraints

- Wind is always requested in m/s (`wind_speed_unit=ms`) — do not remove this param.
- Daily values are derived from stitched hourly entries, never from Open-Meteo's pre-aggregated daily fields, on the NA path.
- Never derive a day boundary from `toISOString()` — use `localDayAndHour` from `lib/sliceWeather.ts`.
- `DailyWeather` gains no new fields in this plan. History stays on its current single daily chart.
- Model labels and section dividers render on panel 1 only.
- Tests run serially against `crag_test`; run with `npx vitest run <path>`.
- Commit after each task using conventional commit format.
- **Recharts renders nothing in jsdom.** `ResponsiveContainer` measures 0×0, so the chart
  body — legend, lines, bars, axes — never enters the DOM, and wrapping the component in a
  sized `<div>` does not help (verified: 153 chars of empty container, legend absent). Any
  test asserting on chart internals MUST hoist the `ResponsiveContainer` mock shown in Task 4
  Step 5. This is why `tests/components/WeatherChart.test.tsx` only ever asserts on its
  caption. Copy the mock verbatim into each panel test file; `vi.mock` is hoisted per-file
  and does not abstract cleanly into a shared helper.

---

### Task 1: Swap stitch tier 3 to `gfs_seamless` [model: claude-haiku-4-5]

Mechanical one-line model-id change plus test-expectation updates. No behavior change is expected in any displayed value — this was verified against the live API (see spec, "gfs_seamless is a server-side stitch, and is free to adopt").

**Files:**
- Modify: `lib/weather.ts:33-37`
- Test: `tests/lib/weather.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `NA_MODELS` tier 3 is `{ id: "gfs_seamless", label: "GFS" }`. The label stays `"GFS"`, so every existing badge assertion elsewhere remains valid.

- [ ] **Step 1: Update the failing test expectations**

In `tests/lib/weather.test.ts` there are two assertions of the models param. Change both occurrences from:

```ts
expect(url.searchParams.get("models")).toBe("ncep_hrrr_conus,ncep_nam_conus,gfs_global");
```

to:

```ts
expect(url.searchParams.get("models")).toBe("ncep_hrrr_conus,ncep_nam_conus,gfs_seamless");
```

Then rename the fixture keys in `multiFixture` (in the same file) from `_gfs_global` to `_gfs_seamless`:

```ts
      temperature_2m_gfs_seamless:      fixture.hourly.temperature_2m,
      precipitation_gfs_seamless:       fixture.hourly.precipitation,
      wind_speed_10m_gfs_seamless:      Array.from({ length: 14 * 24 }, () => 3),
      wind_gusts_10m_gfs_seamless:      Array.from({ length: 14 * 24 }, () => 5),
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/weather.test.ts`
Expected: FAIL — the models param assertion reports the received value still ends in `gfs_global`, and stitched hourly entries are `undefined` because the prefixed lookup misses.

- [ ] **Step 3: Make the change**

In `lib/weather.ts`:

```ts
const NA_MODELS = [
  { id: "ncep_hrrr_conus", label: "HRRR" },
  { id: "ncep_nam_conus",  label: "NAM"  },
  { id: "gfs_seamless",    label: "GFS"  },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/weather.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/weather.ts tests/lib/weather.test.ts
git commit -m "refactor: swap stitch tier 3 to gfs_seamless

Identical to gfs_global on every variable in tier-3 territory (verified
n=309, meanAbsDiff 0.000), but carries full-window precipitation
probability. No displayed value changes."
```

---

### Task 2: Carry humidity, feels-like and dew point through the stitch [model: claude-sonnet-5]

These three have null patterns identical to `temperature_2m` on every model, so they ride the existing priority walk with no new logic.

**Files:**
- Modify: `lib/weather.ts`
- Test: `tests/lib/weather.test.ts`
- Modify (type fallout): `tests/components/DailyCards.test.tsx:10`, `tests/components/GpsWeatherPage.test.tsx:19`, `tests/components/RoutePage.test.tsx:24,71`, `tests/lib/sliceWeather.test.ts:10`

**Interfaces:**
- Consumes: `NA_MODELS` from Task 1
- Produces: `HourlyWeather` gains required `feelsLike: number`, `dewPoint: number`, `humidity: number`. `stitchModels(responses, names)` signature unchanged. `OmHourlyResponse.hourly` gains `relative_humidity_2m`, `apparent_temperature`, `dew_point_2m` as `(number | null)[]`.

- [ ] **Step 1: Write the failing tests**

Add the new arrays to `multiFixture` in `tests/lib/weather.test.ts`, alongside the existing per-model entries:

```ts
      relative_humidity_2m_ncep_hrrr_conus: Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 216 ? 40 : null),
      apparent_temperature_ncep_hrrr_conus: Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 216 ? 13 : null),
      dew_point_2m_ncep_hrrr_conus:         Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 216 ? 2  : null),
      relative_humidity_2m_ncep_nam_conus:  Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 264 ? 55 : null),
      apparent_temperature_ncep_nam_conus:  Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 264 ? 11 : null),
      dew_point_2m_ncep_nam_conus:          Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 264 ? 4  : null),
      relative_humidity_2m_gfs_seamless:    Array.from({ length: 14 * 24 }, () => 70),
      apparent_temperature_gfs_seamless:    Array.from({ length: 14 * 24 }, () => 9),
      dew_point_2m_gfs_seamless:            Array.from({ length: 14 * 24 }, () => 6),
```

Add this test to the `fetchWeather` describe block:

```ts
  it("carries humidity, feels-like and dew point from the winning model", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("hourly")).toContain("relative_humidity_2m");
        expect(url.searchParams.get("hourly")).toContain("apparent_temperature");
        expect(url.searchParams.get("hourly")).toContain("dew_point_2m");
        return HttpResponse.json(multiFixture);
      }),
    );
    const w = await fetchWeather(37.73, -119.64);
    // slot 168 = first HRRR slot
    expect(w.hourly[168]).toMatchObject({ model: "HRRR", humidity: 40, feelsLike: 13, dewPoint: 2 });
    // slot 216 = first NAM slot
    expect(w.hourly[216]).toMatchObject({ model: "NAM", humidity: 55, feelsLike: 11, dewPoint: 4 });
    // slot 264 = GFS
    expect(w.hourly[264]).toMatchObject({ model: "GFS", humidity: 70, feelsLike: 9, dewPoint: 6 });
  });
```

Add this test to the non-NA path (inside the same `fetchWeather` describe):

```ts
  it("includes humidity, feels-like and dew point for a non-NA route", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(fixture)),
    );
    const w = await fetchWeather(45.92, 6.87);
    expect(typeof w.hourly[0].humidity).toBe("number");
    expect(typeof w.hourly[0].feelsLike).toBe("number");
    expect(typeof w.hourly[0].dewPoint).toBe("number");
  });
```

Add the three arrays to the non-NA fixture file `tests/fixtures/open-meteo.json` under `hourly`, each the same length as the existing `temperature_2m` array (336 entries):
`relative_humidity_2m` (fill `65`), `apparent_temperature` (fill `8`), `dew_point_2m` (fill `3`).

Use this script to add them rather than hand-editing 336-element arrays:

```bash
node -e '
const fs=require("fs"),p="tests/fixtures/open-meteo.json";
const j=JSON.parse(fs.readFileSync(p,"utf8"));
const n=j.hourly.temperature_2m.length;
j.hourly.relative_humidity_2m=Array.from({length:n},()=>65);
j.hourly.apparent_temperature=Array.from({length:n},()=>8);
j.hourly.dew_point_2m=Array.from({length:n},()=>3);
fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n");
console.log("added, n =",n);
'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/weather.test.ts`
Expected: FAIL — `humidity`, `feelsLike`, `dewPoint` are `undefined` on the returned hourly entries.

- [ ] **Step 3: Implement**

In `lib/weather.ts`, extend the exported type:

```ts
export type HourlyWeather = {
  datetime: string;
  temp: number;
  feelsLike: number;
  dewPoint: number;
  humidity: number;
  precip: number;
  windSpeed: number;
  windGust: number;
  model?: string;
};
```

Extend both response types:

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
    apparent_temperature: number[];
    dew_point_2m: number[];
    relative_humidity_2m: number[];
    precipitation: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
  };
};

type OmHourlyResponse = {
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
    apparent_temperature: (number | null)[];
    dew_point_2m: (number | null)[];
    relative_humidity_2m: (number | null)[];
    precipitation: (number | null)[];
    wind_speed_10m: (number | null)[];
    wind_gusts_10m: (number | null)[];
  };
};
```

In `stitchModels`, extend the pushed object (the winning-model branch):

```ts
        hourly.push({
          datetime: r.hourly.time[i],
          temp: r.hourly.temperature_2m[i]!,
          feelsLike: r.hourly.apparent_temperature[i] ?? r.hourly.temperature_2m[i]!,
          dewPoint: r.hourly.dew_point_2m[i] ?? 0,
          humidity: r.hourly.relative_humidity_2m[i] ?? 0,
          precip: r.hourly.precipitation[i] ?? 0,
          windSpeed: r.hourly.wind_speed_10m[i] ?? 0,
          windGust: r.hourly.wind_gusts_10m[i] ?? 0,
          model: names[m],
        });
```

In `fetchWeather`, extend the hourly param:

```ts
  url.searchParams.set(
    "hourly",
    "temperature_2m,apparent_temperature,dew_point_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m",
  );
```

Extend the per-model extraction:

```ts
    const responses: OmHourlyResponse[] = NA_MODELS.map(m => ({
      hourly: {
        time: j.hourly.time as string[],
        temperature_2m:       j.hourly[`temperature_2m_${m.id}`]       as (number | null)[],
        apparent_temperature: j.hourly[`apparent_temperature_${m.id}`] as (number | null)[],
        dew_point_2m:         j.hourly[`dew_point_2m_${m.id}`]         as (number | null)[],
        relative_humidity_2m: j.hourly[`relative_humidity_2m_${m.id}`] as (number | null)[],
        precipitation:        j.hourly[`precipitation_${m.id}`]        as (number | null)[],
        wind_speed_10m:       j.hourly[`wind_speed_10m_${m.id}`]       as (number | null)[],
        wind_gusts_10m:       j.hourly[`wind_gusts_10m_${m.id}`]       as (number | null)[],
      },
    }));
```

Extend the non-NA hourly mapping:

```ts
  const hourly = j.hourly.time.map((t, i) => ({
    datetime: t,
    temp: j.hourly.temperature_2m[i] as number,
    feelsLike: j.hourly.apparent_temperature[i] ?? (j.hourly.temperature_2m[i] as number),
    dewPoint: j.hourly.dew_point_2m[i] ?? 0,
    humidity: j.hourly.relative_humidity_2m[i] ?? 0,
    precip: j.hourly.precipitation[i] ?? 0,
    windSpeed: j.hourly.wind_speed_10m[i] ?? 0,
    windGust: j.hourly.wind_gusts_10m[i] ?? 0,
  }));
```

- [ ] **Step 4: Fix the type fallout in existing tests**

`HourlyWeather` now has three more required fields, so every test literal fails to typecheck. Update each:

`tests/lib/sliceWeather.test.ts:10`:
```ts
  return { datetime, temp: 15, feelsLike: 14, dewPoint: 5, humidity: 60, precip: 0, windSpeed: 3, windGust: 5 };
```

`tests/components/DailyCards.test.tsx:10`:
```ts
const hr = (datetime: string, t: number, p: number): HourlyWeather =>
  ({ datetime, temp: t, feelsLike: t, dewPoint: 5, humidity: 60, precip: p, windSpeed: 10, windGust: 15 });
```

`tests/components/GpsWeatherPage.test.tsx:19` and `tests/components/RoutePage.test.tsx:71`:
```ts
  hourly: [{ datetime: "2026-05-29T12:00", temp: 18, feelsLike: 17, dewPoint: 6, humidity: 55, precip: 0, windSpeed: 3, windGust: 5 }],
```

`tests/components/RoutePage.test.tsx:24` — add the three fields to that hourly literal in the same style.

Also update `makeOm` in `tests/lib/weather.test.ts` so `stitchModels` unit tests still compile:

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
      apparent_temperature: temps.map(() => null),
      dew_point_2m: temps.map(() => null),
      relative_humidity_2m: temps.map(() => null),
      precipitation: precips,
      wind_speed_10m: windSpeeds ?? temps.map(() => null),
      wind_gusts_10m: windGusts ?? temps.map(() => null),
    },
  };
}
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/weather.ts tests/
git commit -m "feat: carry humidity, feels-like and dew point through the stitch

All three have null patterns identical to temperature_2m on every model,
so they ride the existing winning-model walk with no new logic."
```

---

### Task 3: Source `precipChance` from the seamless column, unstitched [model: claude-sonnet-5]

This is the one field that must NOT follow the winning model. NAM returns `0/768`, and the value served under the HRRR prefix is bit-for-bit `gfs_seamless` that flatlines before it ends. See the spec's research section before changing this.

**Files:**
- Modify: `lib/weather.ts`
- Test: `tests/lib/weather.test.ts`

**Interfaces:**
- Consumes: `HourlyWeather` and `OmHourlyResponse` from Task 2
- Produces: `HourlyWeather.precipChance: number | null`. `stitchModels(responses: OmHourlyResponse[], names: string[], precipChance?: (number | null)[])` — third parameter optional; when omitted every entry gets `precipChance: null`.

- [ ] **Step 1: Write the failing tests**

Add the probability arrays to `multiFixture`. Note NAM is deliberately all-null and HRRR deliberately differs from seamless — that is what the real API does:

```ts
      precipitation_probability_ncep_hrrr_conus: Array.from({ length: 14 * 24 }, () => 11),
      precipitation_probability_ncep_nam_conus:  Array.from({ length: 14 * 24 }, () => null),
      precipitation_probability_gfs_seamless:    Array.from({ length: 14 * 24 }, () => 42),
```

Add these tests to the `fetchWeather` describe block:

```ts
  it("sources precipChance from gfs_seamless regardless of the winning model", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("hourly")).toContain("precipitation_probability");
        return HttpResponse.json(multiFixture);
      }),
    );
    const w = await fetchWeather(37.73, -119.64);
    // Every hour takes the seamless value (42), never HRRR's (11), whichever model wins temp.
    expect(w.hourly[168].model).toBe("HRRR");
    expect(w.hourly[168].precipChance).toBe(42);
    expect(w.hourly[264].model).toBe("GFS");
    expect(w.hourly[264].precipChance).toBe(42);
  });

  it("keeps a precipChance through the NAM band, where NAM supplies none", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(multiFixture)),
    );
    const w = await fetchWeather(37.73, -119.64);
    // slot 216 is NAM-only: NAM wins temp/wind but has no probability of its own.
    expect(w.hourly[216].model).toBe("NAM");
    expect(w.hourly[216].temp).toBe(13);
    expect(w.hourly[216].precipChance).toBe(42);
  });
```

Add this test to the `stitchModels` describe block:

```ts
  it("yields null precipChance when no probability array is supplied", () => {
    const result = stitchModels(
      [makeOm([20], [0]), makeOm([18], [0]), makeOm([16], [0])],
      ["HRRR", "NAM", "GFS"],
    );
    expect(result.hourly[0].precipChance).toBeNull();
  });

  it("reads precipChance positionally, not from the winning model", () => {
    const result = stitchModels(
      [makeOm([null, 20], [0, 0]), makeOm([18, 18], [0, 0]), makeOm([16, 16], [0, 0])],
      ["HRRR", "NAM", "GFS"],
      [30, 70],
    );
    expect(result.hourly[0].model).toBe("NAM");
    expect(result.hourly[0].precipChance).toBe(30);
    expect(result.hourly[1].model).toBe("HRRR");
    expect(result.hourly[1].precipChance).toBe(70);
  });
```

Add the field to the non-NA fixture with the same script pattern as Task 2:

```bash
node -e '
const fs=require("fs"),p="tests/fixtures/open-meteo.json";
const j=JSON.parse(fs.readFileSync(p,"utf8"));
const n=j.hourly.temperature_2m.length;
j.hourly.precipitation_probability=Array.from({length:n},()=>25);
fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n");
console.log("added, n =",n);
'
```

And a non-NA assertion:

```ts
  it("includes precipChance for a non-NA route", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(fixture)),
    );
    const w = await fetchWeather(45.92, 6.87);
    expect(w.hourly[0].precipChance).toBe(25);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/weather.test.ts`
Expected: FAIL — `precipChance` is `undefined`, and `stitchModels` rejects a third argument.

- [ ] **Step 3: Implement**

In `lib/weather.ts`, add to the type:

```ts
export type HourlyWeather = {
  datetime: string;
  temp: number;
  feelsLike: number;
  dewPoint: number;
  humidity: number;
  precip: number;
  precipChance: number | null;
  windSpeed: number;
  windGust: number;
  model?: string;
};
```

Add `precipitation_probability: number[]` to `OmResponse.hourly`. Do **not** add it to `OmHourlyResponse` — it is not a per-model value and must not be reachable from the stitch walk.

Change the `stitchModels` signature and the pushed object:

```ts
export function stitchModels(
  responses: OmHourlyResponse[],
  names: string[],
  precipChance?: (number | null)[],
): WeatherResponse {
```

```ts
        hourly.push({
          datetime: r.hourly.time[i],
          temp: r.hourly.temperature_2m[i]!,
          feelsLike: r.hourly.apparent_temperature[i] ?? r.hourly.temperature_2m[i]!,
          dewPoint: r.hourly.dew_point_2m[i] ?? 0,
          humidity: r.hourly.relative_humidity_2m[i] ?? 0,
          precip: r.hourly.precipitation[i] ?? 0,
          // Chance of precipitation is a single ensemble product, not a per-model
          // value: NAM supplies none at all, and the HRRR-prefixed column is
          // bit-for-bit gfs_seamless that flatlines before it ends. Read it
          // positionally from the seamless column instead of off the winning model.
          precipChance: precipChance?.[i] ?? null,
          windSpeed: r.hourly.wind_speed_10m[i] ?? 0,
          windGust: r.hourly.wind_gusts_10m[i] ?? 0,
          model: names[m],
        });
```

Add `precipitation_probability` to the hourly request param:

```ts
  url.searchParams.set(
    "hourly",
    "temperature_2m,apparent_temperature,dew_point_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m",
  );
```

Pass the seamless column through in the NA branch:

```ts
    const seamlessChance = j.hourly["precipitation_probability_gfs_seamless"] as
      (number | null)[] | undefined;
    return stitchModels(responses, NA_MODELS.map(m => m.label), seamlessChance);
```

Add it to the non-NA mapping:

```ts
    precipChance: j.hourly.precipitation_probability?.[i] ?? null,
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/weather.ts tests/
git commit -m "feat: source precipChance from gfs_seamless, unstitched

NAM returns no probability at all and the HRRR-prefixed column is
bit-for-bit gfs_seamless that flatlines before ending, so chance of
precipitation is read positionally from the seamless column rather than
off the winning model."
```

---

### Task 4: Extract `buildSections` and `TempPanel`, rewire `ForecastChart` [model: claude-sonnet-5]

`ForecastChart` currently renders panel 1 itself while also coordinating the stack. Split those roles so panels 2 and 3 have somewhere to land. Moving `buildSections` to `lib/` avoids a circular import between the coordinator and the panel that renders its output.

**Files:**
- Create: `lib/modelSections.ts`
- Create: `components/TempPanel.tsx`
- Create: `tests/lib/modelSections.test.ts`
- Create: `tests/components/TempPanel.test.tsx`
- Modify: `components/ForecastChart.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `HourlyWeather` (with `feelsLike`, `dewPoint`) from Tasks 2–3; `WeekendBand` from `lib/weekendBands.ts`
- Produces:
  - `lib/modelSections.ts` exports `type Section = { model: string; start: string; mid: string; end: string }` and `buildSections(hourly: HourlyWeather[]): Section[]`
  - `components/TempPanel.tsx` exports `TempPanel(props: TempPanelProps)` where
    ```ts
    interface TempPanelProps {
      data: { x: string; temp: number; feelsLike: number; dewPoint: number }[];
      sections?: Section[];
      ticks?: string[];
      tickFormatter?: (v: string) => string;
      weekendBands?: WeekendBand[];
      onHover?: (index: number) => void;
      onLeave?: () => void;
    }
    ```

- [ ] **Step 1: Write the failing test for `buildSections`**

Create `tests/lib/modelSections.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSections } from "@/lib/modelSections";
import type { HourlyWeather } from "@/lib/weather";

const h = (datetime: string, model?: string): HourlyWeather => ({
  datetime, temp: 10, feelsLike: 9, dewPoint: 4, humidity: 60,
  precip: 0, precipChance: 20, windSpeed: 3, windGust: 5, model,
});

describe("buildSections", () => {
  it("groups consecutive hours by model", () => {
    const sections = buildSections([
      h("2026-01-01T00:00", "HRRR"),
      h("2026-01-01T01:00", "HRRR"),
      h("2026-01-01T02:00", "NAM"),
    ]);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ model: "HRRR", start: "2026-01-01T00:00", end: "2026-01-01T01:00" });
    expect(sections[1]).toMatchObject({ model: "NAM", start: "2026-01-01T02:00" });
  });

  it("skips hours with no model", () => {
    expect(buildSections([h("2026-01-01T00:00")])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/modelSections.test.ts`
Expected: FAIL — cannot resolve `@/lib/modelSections`.

- [ ] **Step 3: Create `lib/modelSections.ts`**

Move the type and function verbatim out of `components/ForecastChart.tsx:22-46`:

```ts
import type { HourlyWeather } from "@/lib/weather";

export type Section = { model: string; start: string; mid: string; end: string };

export function buildSections(hourly: HourlyWeather[]): Section[] {
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/lib/modelSections.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for `TempPanel`**

Create `tests/components/TempPanel.test.tsx`. The `vi.mock` block is mandatory — without it
`ResponsiveContainer` measures 0×0 in jsdom and none of these assertions can pass. It is
hoisted above the imports by Vitest, so the plain static `import { TempPanel }` below is
correct as written (verified):

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TempPanel } from "@/components/TempPanel";

// Recharts' ResponsiveContainer measures 0x0 in jsdom and renders no chart body.
// Give it an explicit size so the legend, lines and axes reach the DOM.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <actual.ResponsiveContainer width={800} height={300}>{children}</actual.ResponsiveContainer>
    ),
  };
});

const data = Array.from({ length: 24 }, (_, i) => ({
  x: `2026-01-01T${String(i).padStart(2, "0")}:00`,
  temp: 10 + i,
  feelsLike: 8 + i,
  dewPoint: 3,
}));

describe("TempPanel", () => {
  it("renders all three series in the legend", () => {
    render(<TempPanel data={data} />);
    expect(screen.getByText("Temp (°C)")).toBeInTheDocument();
    expect(screen.getByText("Feels like (°C)")).toBeInTheDocument();
    expect(screen.getByText("Dew point (°C)")).toBeInTheDocument();
  });

  it("renders a model label and a divider for each section boundary", () => {
    render(
      <TempPanel
        data={data}
        sections={[
          { model: "HRRR", start: data[0].x,  mid: data[2].x,  end: data[4].x },
          { model: "NAM",  start: data[5].x,  mid: data[8].x,  end: data[11].x },
        ]}
      />,
    );
    expect(screen.getByText("HRRR")).toBeInTheDocument();
    expect(screen.getByText("NAM")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/components/TempPanel.test.tsx`
Expected: FAIL — cannot resolve `@/components/TempPanel`.

- [ ] **Step 7: Create `components/TempPanel.tsx`**

```tsx
"use client";
import {
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
import type { WeekendBand } from "@/lib/weekendBands";
import type { Section } from "@/lib/modelSections";

interface TempPanelProps {
  data: { x: string; temp: number; feelsLike: number; dewPoint: number }[];
  sections?: Section[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
  weekendBands?: WeekendBand[];
  onHover?: (index: number) => void;
  onLeave?: () => void;
}

export function TempPanel({
  data, sections, ticks, tickFormatter, weekendBands, onHover, onLeave,
}: TempPanelProps) {
  function hover(label: unknown) {
    if (label === undefined || !onHover) return;
    const idx = data.findIndex(d => d.x === String(label));
    if (idx >= 0) onHover(idx);
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart
        data={data}
        margin={{ top: 32, right: 80, bottom: 16, left: 0 }}
        onMouseMove={(s) => hover(s.activeLabel)}
        onTouchMove={(s) => hover(s.activeLabel)}
        onTouchStart={(s) => hover(s.activeLabel)}
        onMouseLeave={onLeave}
        onTouchEnd={onLeave}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />

        {weekendBands?.map(b => (
          <ReferenceArea key={`weekend-${b.start}`} x1={b.start} x2={b.end}
            fill="#f59e0b" fillOpacity={0.08} stroke="none" />
        ))}

        <XAxis dataKey="x" ticks={ticks} tickFormatter={tickFormatter} />
        <YAxis label={{ value: "°C", angle: -90, position: "insideLeft" }} />
        <Legend />
        <Tooltip content={() => null} />

        {sections?.map(s => (
          <ReferenceLine key={`label-${s.start}`} x={s.mid} stroke="none"
            label={{ value: s.model, position: "top", fill: "#6b7280", fontSize: 11, fontWeight: 500 }} />
        ))}
        {sections?.slice(1).map(s => (
          <ReferenceLine key={`div-${s.start}`} x={s.start}
            stroke="#d1d5db" strokeDasharray="4 4" strokeWidth={1.5} />
        ))}

        <Line dataKey="dewPoint"  name="Dew point (°C)"  stroke="#6b7280" strokeWidth={1.5} strokeDasharray="2 3" dot={false} />
        <Line dataKey="feelsLike" name="Feels like (°C)" stroke="#f87171" strokeWidth={2}   strokeDasharray="5 3" dot={false} />
        <Line dataKey="temp"      name="Temp (°C)"       stroke="#dc2626" strokeWidth={2}   dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run tests/components/TempPanel.test.tsx`
Expected: PASS

- [ ] **Step 9: Rewire `ForecastChart` to coordinate rather than render**

Replace `components/ForecastChart.tsx` entirely. Precipitation stays a bar on `WindPanel`'s sibling slot only after Task 5 — for now panel 2 is absent and precip moves out of panel 1, so this step temporarily drops the precip bars from the UI. Task 5 restores them. Keep `precip` in `ActivePoint` so the tooltip strip is unbroken.

```tsx
"use client";
import { useState } from "react";
import type { HourlyWeather } from "@/lib/weather";
import { TempPanel } from "@/components/TempPanel";
import { WindPanel } from "@/components/WindPanel";
import { buildSections } from "@/lib/modelSections";
import { getWeekendBands } from "@/lib/weekendBands";

type ActivePoint = {
  datetime: string;
  temp: number;
  feelsLike: number;
  dewPoint: number;
  humidity: number;
  precip: number;
  precipChance: number | null;
  windSpeed: number;
  windGust: number;
};

export function ForecastChart({ hourly }: { hourly: HourlyWeather[] }) {
  const [activePoint, setActivePoint] = useState<ActivePoint | null>(null);

  const tempData = hourly.map(h => ({
    x: h.datetime,
    temp: Math.round(h.temp),
    feelsLike: Math.round(h.feelsLike),
    dewPoint: Math.round(h.dewPoint),
  }));

  const windData = hourly.map(h => ({
    x: h.datetime,
    speed: Math.round(h.windSpeed),
    gust: Math.round(h.windGust),
  }));

  const dayTicks = hourly
    .filter(h => h.datetime.slice(11) === "00:00")
    .map(h => h.datetime);

  const sections = buildSections(hourly);
  const weekendBands = getWeekendBands(dayTicks, hourly.at(-1)?.datetime ?? "");
  const fmt = (v: string) => v.slice(5, 10);

  function handleHover(idx: number) {
    if (idx < 0 || idx >= hourly.length) return;
    const h = hourly[idx];
    setActivePoint({
      datetime: h.datetime,
      temp: Math.round(h.temp),
      feelsLike: Math.round(h.feelsLike),
      dewPoint: Math.round(h.dewPoint),
      humidity: Math.round(h.humidity),
      precip: h.precip,
      precipChance: h.precipChance,
      windSpeed: Math.round(h.windSpeed),
      windGust: Math.round(h.windGust),
    });
  }

  function clear() {
    setActivePoint(null);
  }

  return (
    <div className="chart-wrap">
      <div className="chart-tooltip-strip">
        {activePoint ? (
          <>
            <span>{activePoint.datetime.replace("T", " ")}</span>
            <span style={{ color: "#dc2626" }}>{activePoint.temp}°C</span>
            <span style={{ color: "#f87171" }}>feels {activePoint.feelsLike}°C</span>
            <span style={{ color: "#6b7280" }}>dew {activePoint.dewPoint}°C</span>
            <span style={{ color: "#60a5fa" }}>{activePoint.precip.toFixed(1)} mm</span>
            {activePoint.precipChance !== null && (
              <span style={{ color: "#2563eb" }}>{activePoint.precipChance}%</span>
            )}
            <span style={{ color: "#0891b2" }}>{activePoint.humidity}% RH</span>
            <span style={{ color: "#059669" }}>{activePoint.windSpeed} m/s</span>
            <span style={{ color: "#6b7280" }}>{activePoint.windGust} m/s gust</span>
          </>
        ) : (
          <span style={{ color: "var(--muted)" }}>—</span>
        )}
      </div>
      <div className="chart-scroll">
        <div className="chart-inner">
          <TempPanel
            data={tempData}
            sections={sections}
            ticks={dayTicks}
            tickFormatter={fmt}
            weekendBands={weekendBands}
            onHover={handleHover}
            onLeave={clear}
          />
          <p className="chart-note">
            <strong>Dew point</strong> is the temperature at which air becomes saturated.
            When the temperature line drops toward the dew-point line, moisture condenses
            and rock goes damp even without rain. Below ~5°C means dry air and better
            friction; above ~15°C feels greasy.
          </p>
          <WindPanel
            data={windData}
            ticks={dayTicks}
            tickFormatter={fmt}
            weekendBands={weekendBands}
            onHover={handleHover}
            onLeave={clear}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Widen the dew-point note style**

In `app/globals.css`, the existing `.chart-note` (line 113) is sized for a short caption. Add a modifier so the explainer wraps readably inside the scroll container:

```css
.chart-note { font-size: 0.75rem; color: var(--muted); margin: 0.375rem 0 0; max-width: 60ch; }
```

- [ ] **Step 11: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add lib/modelSections.ts components/TempPanel.tsx components/ForecastChart.tsx app/globals.css tests/
git commit -m "refactor: extract TempPanel and buildSections from ForecastChart

ForecastChart becomes a pure stack coordinator owning hover state, ticks,
weekend bands and the tooltip strip. Panel 1 gains feels-like and dew
point on the shared degrees-C axis, with an explainer note beneath."
```

---

### Task 5: Add `PrecipPanel` (mm bars + chance line) [model: claude-sonnet-5]

Restores the precipitation bars dropped in Task 4 and adds the chance line on a fixed 0–100 right axis.

**Files:**
- Create: `components/PrecipPanel.tsx`
- Create: `tests/components/PrecipPanel.test.tsx`
- Modify: `components/ForecastChart.tsx`

**Interfaces:**
- Consumes: `WeekendBand`; `HourlyWeather.precip` / `precipChance` from Task 3
- Produces: `PrecipPanel(props)` where
  ```ts
  interface PrecipPanelProps {
    data: { x: string; precip: number; chance: number | null }[];
    ticks?: string[];
    tickFormatter?: (v: string) => string;
    weekendBands?: WeekendBand[];
    onHover?: (index: number) => void;
    onLeave?: () => void;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/components/PrecipPanel.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrecipPanel } from "@/components/PrecipPanel";

// Recharts' ResponsiveContainer measures 0x0 in jsdom and renders no chart body.
// Give it an explicit size so the legend, bars and axes reach the DOM.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <actual.ResponsiveContainer width={800} height={300}>{children}</actual.ResponsiveContainer>
    ),
  };
});

const data = Array.from({ length: 24 }, (_, i) => ({
  x: `2026-01-01T${String(i).padStart(2, "0")}:00`,
  precip: i % 3,
  chance: i * 4,
}));

describe("PrecipPanel", () => {
  it("renders both series in the legend", () => {
    render(<PrecipPanel data={data} />);
    expect(screen.getByText("Precip (mm)")).toBeInTheDocument();
    expect(screen.getByText("Chance (%)")).toBeInTheDocument();
  });

  it("renders with a null chance without crashing", () => {
    const withNull = data.map((d, i) => ({ ...d, chance: i === 5 ? null : d.chance }));
    render(<PrecipPanel data={withNull} />);
    expect(screen.getByText("Chance (%)")).toBeInTheDocument();
  });

  it("pins the percent axis to 0-100 regardless of the data range", () => {
    // All chances are single-digit; a fitted domain would stretch them to full height.
    const flat = data.map(d => ({ ...d, chance: 3 }));
    render(<PrecipPanel data={flat} />);
    expect(screen.getByText("100")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/PrecipPanel.test.tsx`
Expected: FAIL — cannot resolve `@/components/PrecipPanel`.

- [ ] **Step 3: Create `components/PrecipPanel.tsx`**

```tsx
"use client";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeekendBand } from "@/lib/weekendBands";

interface PrecipPanelProps {
  data: { x: string; precip: number; chance: number | null }[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
  weekendBands?: WeekendBand[];
  onHover?: (index: number) => void;
  onLeave?: () => void;
}

export function PrecipPanel({
  data, ticks, tickFormatter, weekendBands, onHover, onLeave,
}: PrecipPanelProps) {
  function hover(label: unknown) {
    if (label === undefined || !onHover) return;
    const idx = data.findIndex(d => d.x === String(label));
    if (idx >= 0) onHover(idx);
  }
  return (
    <ResponsiveContainer width="100%" height={150}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 80, bottom: 16, left: 0 }}
        onMouseMove={(s) => hover(s.activeLabel)}
        onTouchMove={(s) => hover(s.activeLabel)}
        onTouchStart={(s) => hover(s.activeLabel)}
        onMouseLeave={onLeave}
        onTouchEnd={onLeave}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />

        {weekendBands?.map(b => (
          <ReferenceArea key={`weekend-${b.start}`} x1={b.start} x2={b.end} yAxisId="mm"
            fill="#f59e0b" fillOpacity={0.08} stroke="none" />
        ))}

        <XAxis dataKey="x" ticks={ticks} tickFormatter={tickFormatter} />
        <YAxis yAxisId="mm" orientation="left" label={{ value: "mm", angle: -90, position: "insideLeft" }} />
        <YAxis yAxisId="pct" orientation="right" width={48} domain={[0, 100]}
          label={{ value: "%", angle: 90, position: "insideRight" }} />
        <Legend />
        <Tooltip content={() => null} />

        <Bar yAxisId="mm" dataKey="precip" name="Precip (mm)" fill="#60a5fa" />
        <Line yAxisId="pct" dataKey="chance" name="Chance (%)" stroke="#2563eb"
          strokeWidth={2} dot={false} connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
```

The `domain={[0, 100]}` is deliberate: a fitted domain would make a 12% peak look like a downpour.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/components/PrecipPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Mount it in `ForecastChart`**

Add the import:

```tsx
import { PrecipPanel } from "@/components/PrecipPanel";
```

Add the derived data next to `tempData`:

```tsx
  const precipData = hourly.map(h => ({
    x: h.datetime,
    precip: h.precip,
    chance: h.precipChance,
  }));
```

Insert the panel between the dew-point note and `WindPanel`:

```tsx
          <PrecipPanel
            data={precipData}
            ticks={dayTicks}
            tickFormatter={fmt}
            weekendBands={weekendBands}
            onHover={handleHover}
            onLeave={clear}
          />
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add components/PrecipPanel.tsx components/ForecastChart.tsx tests/components/PrecipPanel.test.tsx
git commit -m "feat: add precipitation panel with chance-of-rain line

Amount as bars on the mm axis, chance as a line on a fixed 0-100 axis so
its height means the same thing at every crag and day-window."
```

---

### Task 6: Add `HumidityPanel` [model: claude-haiku-4-5]

Simplest panel in the stack — one line, one fixed axis.

**Files:**
- Create: `components/HumidityPanel.tsx`
- Create: `tests/components/HumidityPanel.test.tsx`
- Modify: `components/ForecastChart.tsx`

**Interfaces:**
- Consumes: `WeekendBand`; `HourlyWeather.humidity` from Task 2
- Produces: `HumidityPanel(props)` where
  ```ts
  interface HumidityPanelProps {
    data: { x: string; humidity: number }[];
    ticks?: string[];
    tickFormatter?: (v: string) => string;
    weekendBands?: WeekendBand[];
    onHover?: (index: number) => void;
    onLeave?: () => void;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/components/HumidityPanel.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HumidityPanel } from "@/components/HumidityPanel";

// Recharts' ResponsiveContainer measures 0x0 in jsdom and renders no chart body.
// Give it an explicit size so the legend, line and axes reach the DOM.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <actual.ResponsiveContainer width={800} height={300}>{children}</actual.ResponsiveContainer>
    ),
  };
});

const data = Array.from({ length: 24 }, (_, i) => ({
  x: `2026-01-01T${String(i).padStart(2, "0")}:00`,
  humidity: 40 + i,
}));

describe("HumidityPanel", () => {
  it("renders the humidity series in the legend", () => {
    render(<HumidityPanel data={data} />);
    expect(screen.getByText("Humidity (%)")).toBeInTheDocument();
  });

  it("pins the axis to 0-100 regardless of the data range", () => {
    // All humidity is 50; a fitted domain would not produce a 100 tick.
    // Assert only on "100" — "0" matches multiple tick elements.
    render(<HumidityPanel data={data.map(d => ({ ...d, humidity: 50 }))} />);
    expect(screen.getByText("100")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/HumidityPanel.test.tsx`
Expected: FAIL — cannot resolve `@/components/HumidityPanel`.

- [ ] **Step 3: Create `components/HumidityPanel.tsx`**

```tsx
"use client";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeekendBand } from "@/lib/weekendBands";

interface HumidityPanelProps {
  data: { x: string; humidity: number }[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
  weekendBands?: WeekendBand[];
  onHover?: (index: number) => void;
  onLeave?: () => void;
}

export function HumidityPanel({
  data, ticks, tickFormatter, weekendBands, onHover, onLeave,
}: HumidityPanelProps) {
  function hover(label: unknown) {
    if (label === undefined || !onHover) return;
    const idx = data.findIndex(d => d.x === String(label));
    if (idx >= 0) onHover(idx);
  }
  return (
    <ResponsiveContainer width="100%" height={150}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 80, bottom: 16, left: 0 }}
        onMouseMove={(s) => hover(s.activeLabel)}
        onTouchMove={(s) => hover(s.activeLabel)}
        onTouchStart={(s) => hover(s.activeLabel)}
        onMouseLeave={onLeave}
        onTouchEnd={onLeave}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />

        {weekendBands?.map(b => (
          <ReferenceArea key={`weekend-${b.start}`} x1={b.start} x2={b.end}
            fill="#f59e0b" fillOpacity={0.08} stroke="none" />
        ))}

        <XAxis dataKey="x" ticks={ticks} tickFormatter={tickFormatter} />
        <YAxis domain={[0, 100]} label={{ value: "%", angle: -90, position: "insideLeft" }} />
        <Legend />
        <Tooltip content={() => null} />

        <Line dataKey="humidity" name="Humidity (%)" stroke="#0891b2" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/components/HumidityPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Mount it in `ForecastChart`**

Add the import:

```tsx
import { HumidityPanel } from "@/components/HumidityPanel";
```

Add the derived data:

```tsx
  const humidityData = hourly.map(h => ({
    x: h.datetime,
    humidity: Math.round(h.humidity),
  }));
```

Insert between `PrecipPanel` and `WindPanel` so the final order is TempPanel, note, PrecipPanel, HumidityPanel, WindPanel:

```tsx
          <HumidityPanel
            data={humidityData}
            ticks={dayTicks}
            tickFormatter={fmt}
            weekendBands={weekendBands}
            onHover={handleHover}
            onLeave={clear}
          />
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add components/HumidityPanel.tsx components/ForecastChart.tsx tests/components/HumidityPanel.test.tsx
git commit -m "feat: add humidity panel to the forecast stack"
```

---

### Task 7: Fix the `DailyCards` day boundary [model: claude-haiku-4-5]

`DailyCards` derives today via `toISOString()`, the exact pattern CLAUDE.md forbids. During a US evening the UTC date has already rolled over, so today's card silently loses its model badge. `WeatherView` already computes the correct value.

**Files:**
- Modify: `components/DailyCards.tsx:5-13`
- Modify: `components/WeatherView.tsx`
- Test: `tests/components/DailyCards.test.tsx`

**Interfaces:**
- Consumes: `localDayAndHour` from `lib/sliceWeather.ts` (already used by `WeatherView`)
- Produces: `DailyCards({ daily, hourly, today }: { daily: DailyWeather[]; hourly: HourlyWeather[]; today: string })` — `today` is a required prop.

- [ ] **Step 1: Write the failing test**

Add to `tests/components/DailyCards.test.tsx`:

```tsx
  it("uses the injected today for the badge boundary, not the UTC date", () => {
    // A viewer at 18:00 local on 2026-01-15 in a western timezone: the UTC date
    // is already 2026-01-16, so a toISOString()-derived boundary would hide
    // today's badge.
    const daily = [day("2026-01-15", 12, 2, 1, "HRRR")];
    render(<DailyCards daily={daily} hourly={[]} today="2026-01-15" />);
    expect(screen.getByText("HRRR")).toBeInTheDocument();
  });
```

Update the existing badge tests to pass `today` explicitly, so they no longer depend on the real clock:

```tsx
  it("shows model badge for a future date", () => {
    const daily = [day("2099-01-01", 12, 2, 1, "HRRR")];
    render(<DailyCards daily={daily} hourly={[]} today="2026-01-01" />);
    expect(screen.getByText("HRRR")).toBeInTheDocument();
  });

  it("hides model badge for a past date even when model is set", () => {
    const daily = [day("2000-01-01", 12, 2, 1, "HRRR")];
    render(<DailyCards daily={daily} hourly={[]} today="2026-01-01" />);
    expect(screen.queryByText("HRRR")).toBeNull();
  });
```

Add `today="2026-01-01"` to the remaining three `render(<DailyCards ... />)` calls in the file.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/DailyCards.test.tsx`
Expected: FAIL — TypeScript rejects the unknown `today` prop.

- [ ] **Step 3: Implement**

In `components/DailyCards.tsx`, take `today` as a prop and delete the local derivation:

```tsx
export function DailyCards({
  daily,
  hourly,
  today,
}: {
  daily: DailyWeather[];
  hourly: HourlyWeather[];
  today: string;
}) {
  const [openDate, setOpenDate] = useState<string | null>(null);
```

Remove the line `const today = new Date().toISOString().slice(0, 10);`.

In `components/WeatherView.tsx`, pass the value it already has:

```tsx
        <DailyCards daily={forecastDaily} hourly={forecastHourly} today={today} />
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/components/DailyCards.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full suite and lint**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add components/DailyCards.tsx components/WeatherView.tsx tests/components/DailyCards.test.tsx
git commit -m "fix: derive DailyCards day boundary from local time

toISOString() rolls over to tomorrow during a US evening, hiding today's
model badge. WeatherView already computes the local day via
localDayAndHour; pass it down instead."
```

---

### Task 8: Update CLAUDE.md [model: claude-sonnet-5]

The project's architecture notes are load-bearing for future sessions, and three of this plan's decisions are non-obvious enough to be re-litigated without them.

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything above
- Produces: no code

- [ ] **Step 1: Update the multi-model section**

In the "Multi-model weather stitching" table, change the tier-3 row's model id from `gfs_global` to `gfs_seamless`, and add these paragraphs after the "Stitching" paragraph:

```markdown
**`gfs_seamless` is tier 3, not `gfs_global`.** `gfs_seamless` is Open-Meteo's own
server-side blend of the NCEP family — HRRR where HRRR exists, plain GFS after; it does
*not* use NAM. In tier-3 territory (where HRRR and NAM are both null) it is bit-for-bit
identical to `gfs_global` on every variable used, so the swap changed no displayed value.
It was adopted because it is the only column carrying `precipitation_probability` across
the full window. The manual stitcher still earns its keep for two things `gfs_seamless`
cannot provide: the ~12-hour NAM band, and per-hour model provenance for the badges and
dividers.

**`precipChance` is never stitched.** Chance of precipitation is a single ensemble product
(~27 km), not a per-model value. `ncep_nam_conus` returns all-null for it, and the value
served under the `ncep_hrrr_conus` prefix is bit-for-bit `gfs_seamless` — which additionally
flatlines to a repeated value for its final hours before going null entirely. So
`stitchModels` takes the seamless probability array as an optional third parameter and reads
it positionally, independent of which model wins the hour. Do not "fix" this by folding it
into the winning-model walk: that would drop onto `gfs_global`'s genuinely different series
for the NAM band. `precipChance` is `number | null` rather than defaulting to `0`, because a
rendered "0%" is a claim rather than an absence.
```

- [ ] **Step 2: Update the key-files list**

Replace the `components/ForecastChart.tsx` bullet and add the new entries:

```markdown
- `components/ForecastChart.tsx` — forecast stack **coordinator**: owns the single hover index, the tooltip strip, day ticks, weekend bands and model sections; renders four panels and the dew-point explainer. Holds no chart of its own
- `components/TempPanel.tsx` — panel 1 (260px): temp, feels-like, dew point on one °C axis. The only panel with model labels and section dividers
- `components/PrecipPanel.tsx` — panel 2 (150px): mm bars (left axis) + chance-of-precip line on a fixed 0–100 right axis, `connectNulls={false}`
- `components/HumidityPanel.tsx` — panel 3 (150px): relative humidity on a fixed 0–100 axis
- `components/WindPanel.tsx` — panel 4 (150px): wind speed + gust (teal); forecast only, not history
- `lib/modelSections.ts` — `buildSections`: groups consecutive hourly entries by winning model. Lives in `lib/` so the coordinator and `TempPanel` can share it without a circular import
```

All four panels share one props shape (`data`, `ticks`, `tickFormatter`, `weekendBands`, `onHover`, `onLeave`) so the history section can adopt them later without modification.

- [ ] **Step 3: Update the testing notes**

Append to the Testing section:

```markdown
- Multi-model Open-Meteo mocks need the prefixed arrays for all seven hourly variables. Two mock the real API's quirks deliberately: `precipitation_probability_ncep_nam_conus` must be all-null, and `precipitation_probability_gfs_seamless` must differ from the HRRR-prefixed one — the tests assert the seamless value wins regardless of which model supplies temperature.
- `DailyCards` takes `today` as a required prop; tests inject it rather than relying on the system clock.
- **Gotcha: Recharts renders nothing in jsdom.** `ResponsiveContainer` measures 0×0, so the legend, lines, bars and axes never reach the DOM — and wrapping the component in a sized `<div>` does not help. To assert on chart internals, hoist a `vi.mock("recharts", ...)` that replaces `ResponsiveContainer` with one given an explicit `width`/`height` (see `tests/components/TempPanel.test.tsx`). Without it a test can only assert on markup rendered *outside* the container, which is why `WeatherChart.test.tsx` only checks its caption. Note axis ticks are shared text: `getByText("0")` matches several elements, `getByText("100")` is unique.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the panel stack and gfs_seamless decisions in CLAUDE.md"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Model list tier 3 → `gfs_seamless` | 1 |
| `HourlyWeather` gains feelsLike/dewPoint/humidity | 2 |
| `precipChance: number \| null`, unstitched | 3 |
| API request gains four variables | 2 (three) + 3 (probability) |
| Non-NA path parity | 2, 3 |
| `DailyWeather` untouched | — (no task; verified by omission) |
| `ForecastChart` as coordinator | 4 |
| Shared `PanelProps` shape | 4, 5, 6 |
| Labels/dividers on panel 1 only | 4 |
| TempPanel / PrecipPanel / HumidityPanel / WindPanel | 4, 5, 6, (unchanged) |
| Tooltip strip extension | 4 |
| Dew-point explainer | 4 |
| Adjacent `DailyCards` fix | 7 |
| Testing plan | folded into 1–7 |

**Placeholder scan:** no TBD/TODO; every code step carries real code; no "similar to Task N" references.

**Type consistency:** `Section` is defined in Task 4 and consumed only by `TempPanel`. Panel prop keys are `x` uniformly across all four panels (matching `WindPanel`'s existing `x`). `precipChance` is `number | null` in Task 3 and flows as `chance: number | null` into `PrecipPanel` in Task 5. `stitchModels`' third parameter is optional in Task 3 and every existing two-argument call site stays valid.

**Known intermediate state:** Task 4 temporarily removes the precipitation bars from the UI; Task 5 restores them in a new panel. Tasks 4 and 5 should land together before any deploy.
