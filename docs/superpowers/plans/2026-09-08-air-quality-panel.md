# Air Quality Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sixth forecast panel showing US AQI below humidity, sourced from CAMS via a second Open-Meteo endpoint.

**Architecture:** A standalone `lib/airQuality.ts` fetches `us_aqi` from `air-quality-api.open-meteo.com` — it never touches `stitchModels`, because CAMS has no model-priority walk and no provenance to badge. The result travels as a sibling `air` field beside `weather`, is threaded unsliced to `ForecastChart`, and is joined to the weather hours by exact `datetime` lookup so the panel's x-axis is identical by construction to the five panels above it. The AQ fetch runs concurrently with the weather fetch behind its own catch, so it can never degrade the weather page.

**Tech Stack:** Next.js 15 (App Router, server components), TypeScript, Recharts, Vitest + Testing Library + jsdom, MSW.

**Spec:** `docs/superpowers/specs/2026-09-08-air-quality-panel-design.md`

## Global Constraints

- **Panel margins must match across the stack.** `margin.left` is always the shared `LEFT_MARGIN`; `margin.right` totals 80 including any right-hand axis width. `AirQualityPanel` has no right axis, so it uses `margin.right: 80`.
- **`AQI_AXIS_FLOOR = 100`**, **`AQI_PAD = 10`** — exact values, copied verbatim into `lib/aqiBands.ts`.
- **Never parse a crag-local timestamp with `Date`.** Open-Meteo timestamps are local wall clock; constructing a `Date` reinterprets them in the viewer's zone.
- **Nulls are never coerced to `0`.** A rendered AQI of 0 is a claim of pristine air, not an absence of data.
- **Weekend bands are deliberately omitted from `AirQualityPanel`** — amber reads as an AQI category. Do not "restore consistency" by adding them.
- **ReferenceAreas are emitted before the grid and line.** SVG has no z-index.
- Run tests with `npx vitest run <path>`. Local Postgres must be up (`docker compose up -d`) for DB-backed suites.
- Every commit message ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/aqiBands.ts` (new) | EPA breakpoints, axis domain, category lookup, coverage/cutoff helpers | 1 |
| `lib/airQuality.ts` (new) | `fetchAirQuality` — the CAMS endpoint, nothing else | 2 |
| `components/AirQualityPanel.tsx` (new) | Panel 6: chart only, no notes | 3 |
| `components/ForecastChart.tsx` | Coordinator: `air` prop, AQ memos, panel 6, strip span, both notes | 4 |
| `components/WeatherView.tsx` | Forwards `air` unsliced | 4 |
| `app/api/route/[id]/route.ts` | Concurrent AQ fetch, `air` in the JSON body | 5 |
| `app/route/[id]/page.tsx` | `ApiResponse` gains `air`; passes it down | 5 |
| `app/at/[coords]/page.tsx` | Concurrent AQ fetch; passes `air` down | 5 |
| `CLAUDE.md` | Panel list, second-endpoint section, key files | 6 |

---

### Task 1: AQI bands, domain and coverage helpers

Pure functions, no dependencies on any other task. This is the foundation Tasks 3 and 4 both consume.

**Files:**
- Create: `lib/aqiBands.ts`
- Test: `tests/lib/aqiBands.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type AqiBand = { min: number; max: number; label: string; fill: string }`
  - `AQI_BANDS: readonly AqiBand[]`
  - `AQI_AXIS_FLOOR: number` (100), `AQI_PAD: number` (10)
  - `aqiDomain(values: (number | null)[]): [number, number]`
  - `aqiCategory(value: number): AqiBand`
  - `visibleBands(domainMax: number): AqiBand[]`
  - `lastCoveredIndex(values: (number | null)[]): number`
  - `formatAqiCutoff(iso: string): string`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/aqiBands.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  AQI_AXIS_FLOOR,
  AQI_PAD,
  aqiCategory,
  aqiDomain,
  formatAqiCutoff,
  lastCoveredIndex,
  visibleBands,
} from "@/lib/aqiBands";

describe("aqiDomain", () => {
  it("holds the axis at the floor for clean air", () => {
    // Measured at Yosemite: us_aqi 17..52. Auto-fitting that range would draw a
    // "Good" day as a full-height line reading as an emergency, and the scale
    // would shift between crags (Yosemite 17-52 vs LA 59-99) and between the
    // 7/10/15-day windows. Same reasoning as MM_AXIS_FLOOR in PrecipPanel.
    expect(aqiDomain([17, 30, 52])).toEqual([0, AQI_AXIS_FLOOR]);
  });

  it("keeps zero as the lower bound", () => {
    // Unlike temperature (an interval scale, where tempDomain floats the min),
    // AQI is a ratio scale: 0 genuinely means "no pollution".
    const [lo] = aqiDomain([60, 80, 99]);
    expect(lo).toBe(0);
  });

  it("extends above the floor for a smoke event, with headroom", () => {
    expect(aqiDomain([40, 250, 60])).toEqual([0, 250 + AQI_PAD]);
  });

  it("rounds a fractional peak up before padding", () => {
    expect(aqiDomain([180.2])).toEqual([0, 181 + AQI_PAD]);
  });

  it("returns the floor for an empty or all-null series", () => {
    expect(aqiDomain([])).toEqual([0, AQI_AXIS_FLOOR]);
    expect(aqiDomain([null, null])).toEqual([0, AQI_AXIS_FLOOR]);
  });

  it("ignores nulls mixed into a real series", () => {
    expect(aqiDomain([120, null, 200, null])).toEqual([0, 200 + AQI_PAD]);
  });
});

describe("aqiCategory", () => {
  it("puts the EPA boundaries on the right side", () => {
    expect(aqiCategory(0).label).toBe("Good");
    expect(aqiCategory(50).label).toBe("Good");
    expect(aqiCategory(51).label).toBe("Moderate");
    expect(aqiCategory(100).label).toBe("Moderate");
    expect(aqiCategory(101).label).toBe("Unhealthy (sensitive)");
    expect(aqiCategory(200).label).toBe("Unhealthy");
    expect(aqiCategory(300).label).toBe("Very unhealthy");
    expect(aqiCategory(301).label).toBe("Hazardous");
  });

  it("clamps anything above the scale to the top band", () => {
    expect(aqiCategory(9999).label).toBe("Hazardous");
  });
});

describe("visibleBands", () => {
  it("renders exactly the two low bands at the floor", () => {
    // A clean crag should be a calm two-tone panel, not a permanent rainbow.
    const bands = visibleBands(AQI_AXIS_FLOOR);
    expect(bands.map(b => b.label)).toEqual(["Good", "Moderate"]);
  });

  it("reveals higher bands as the domain grows", () => {
    const bands = visibleBands(260);
    expect(bands.map(b => b.label)).toEqual([
      "Good", "Moderate", "Unhealthy (sensitive)", "Unhealthy", "Very unhealthy",
    ]);
  });

  it("clamps the topmost band to the domain so it cannot overshoot the axis", () => {
    const bands = visibleBands(260);
    expect(bands[bands.length - 1].max).toBe(260);
  });

  it("is contiguous, leaving no unpainted gap between bands", () => {
    const bands = visibleBands(260);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].min).toBe(bands[i - 1].max);
    }
  });
});

describe("lastCoveredIndex", () => {
  it("finds the last non-null slot before the trailing tail", () => {
    // The measured CAMS shape: a contiguous prefix then a clean null tail.
    expect(lastCoveredIndex([10, 20, 30, null, null])).toBe(2);
  });

  it("returns the final index when there is no tail", () => {
    expect(lastCoveredIndex([10, 20, 30])).toBe(2);
  });

  it("returns -1 when nothing is covered", () => {
    expect(lastCoveredIndex([])).toBe(-1);
    expect(lastCoveredIndex([null, null])).toBe(-1);
  });
});

describe("formatAqiCutoff", () => {
  it("formats a local timestamp without constructing a Date", () => {
    // Open-Meteo timestamps are crag-local wall clock. new Date("...") would
    // reinterpret them in the viewer's zone — the trap localDayAndHour exists
    // to avoid — so this reads the string positionally.
    expect(formatAqiCutoff("2026-09-12T06:00")).toBe("12 Sep, 06:00");
  });

  it("does not zero-pad the day", () => {
    expect(formatAqiCutoff("2026-01-05T23:00")).toBe("5 Jan, 23:00");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/aqiBands.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/aqiBands"`.

- [ ] **Step 3: Write the implementation**

Create `lib/aqiBands.ts`:

```ts
/**
 * US AQI category breakpoints and the y-axis domain that keeps them on scale.
 *
 * Breakpoints and domain live in one file, unlike the dewPointBands/tempDomain
 * split: there the domain function is shared by two panels, here it exists only
 * to keep these bands renderable, so splitting one panel's constants across two
 * files buys nothing.
 */

export type AqiBand = { min: number; max: number; label: string; fill: string };

/**
 * EPA US AQI categories.
 *
 * Bounds are contiguous (each band's `min` is the previous band's `max`) so the
 * rendered ReferenceAreas leave no unpainted stripe between them. EPA states the
 * categories as 0-50 / 51-100 / 101-150 …; `aqiCategory` reproduces that by
 * taking the first band whose `max` the value does not exceed, so 50 is Good and
 * 51 is Moderate despite the shared 50 boundary.
 */
export const AQI_BANDS: readonly AqiBand[] = [
  { min:   0, max:  50, label: "Good",                  fill: "#00e400" },
  { min:  50, max: 100, label: "Moderate",              fill: "#ffff00" },
  { min: 100, max: 150, label: "Unhealthy (sensitive)", fill: "#ff7e00" },
  { min: 150, max: 200, label: "Unhealthy",             fill: "#ff0000" },
  { min: 200, max: 300, label: "Very unhealthy",        fill: "#8f3f97" },
  { min: 300, max: 500, label: "Hazardous",             fill: "#7e0023" },
];

/**
 * Smallest ceiling the AQI axis will ever show.
 *
 * Clean-air crags sit far below it (measured: Yosemite 17-52, London 19-53), and
 * an auto-fitted axis would stretch that to full height so a "Good" day reads as
 * an emergency — with the scale changing silently between crags and between the
 * 7/10/15-day windows, since the day selector slices before the panel sees the
 * data. At 100 the Good band is always the bottom half and Moderate the top half,
 * so a given line height means the same air everywhere. 100 rather than 50
 * because a floor of 50 would clip Yosemite's own measured peak of 52.
 *
 * It also keeps the bands renderable at all: a Recharts ReferenceArea lying
 * outside the domain is discarded entirely rather than clipped.
 */
export const AQI_AXIS_FLOOR = 100;

/** Headroom above a peak, in AQI points, so the line never touches the panel edge. */
export const AQI_PAD = 10;

/**
 * Y-axis domain for the air-quality panel.
 *
 * Zero is kept as the lower bound. Unlike temperature — an interval scale, where
 * `tempDomain` deliberately floats the minimum — AQI is a ratio scale on which
 * zero means "none", the same property that keeps zero on the precipitation,
 * wind and humidity axes.
 */
export function aqiDomain(values: (number | null)[]): [number, number] {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  const peak = finite.length > 0 ? Math.max(...finite) : 0;
  return [0, Math.max(AQI_AXIS_FLOOR, Math.ceil(peak) + AQI_PAD)];
}

/** The EPA category a value falls in. Values above the scale clamp to the top band. */
export function aqiCategory(value: number): AqiBand {
  return AQI_BANDS.find(b => value <= b.max) ?? AQI_BANDS[AQI_BANDS.length - 1];
}

/**
 * The bands that intersect the current domain, clamped to it.
 *
 * Drawing all six always would make every panel a permanent rainbow; drawing
 * only what the axis reaches means a clean day is calm and a smoke day lights up.
 */
export function visibleBands(domainMax: number): AqiBand[] {
  return AQI_BANDS
    .filter(b => b.min < domainMax)
    .map(b => ({ ...b, max: Math.min(b.max, domainMax) }));
}

/**
 * Index of the last non-null value, or -1 if there is none.
 *
 * CAMS coverage is a contiguous prefix followed by a clean null tail (verified
 * across every variable: zero interior gaps), so this one index fully describes
 * where the forecast stops.
 */
export function lastCoveredIndex(values: (number | null)[]): number {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] != null) return i;
  }
  return -1;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2026-09-12T06:00" -> "12 Sep, 06:00".
 *
 * Read positionally out of the string, never through `new Date(...)`. Open-Meteo
 * timestamps are crag-local wall clock (timezone=auto), so parsing one into a
 * Date reinterprets it in the viewer's timezone — the same trap `localDayAndHour`
 * exists to avoid.
 */
export function formatAqiCutoff(iso: string): string {
  const day = Number(iso.slice(8, 10));
  const month = MONTHS[Number(iso.slice(5, 7)) - 1];
  const time = iso.slice(11, 16);
  return `${day} ${month}, ${time}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/aqiBands.test.ts`
Expected: PASS — 17 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/aqiBands.ts tests/lib/aqiBands.test.ts
git commit -m "feat: add EPA AQI bands, axis domain and coverage helpers

The axis ceiling is floored at 100 for the MM_AXIS_FLOOR reason: measured
clean-air crags sit at 17-52, and auto-fitting that draws a Good day as a
full-height line while the scale shifts silently between crags and day
windows. Zero stays as the lower bound because AQI is a ratio scale.

formatAqiCutoff reads the timestamp positionally rather than through Date,
since Open-Meteo timestamps are crag-local wall clock.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `fetchAirQuality`

Independent of Task 1. Talks to the second endpoint and normalises it — nothing else.

**Files:**
- Create: `lib/airQuality.ts`
- Modify: `tests/mocks/handlers.ts`
- Test: `tests/lib/airQuality.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type HourlyAir = { datetime: string; usAqi: number | null }`
  - `type AirQualityResponse = { hourly: HourlyAir[] }`
  - `fetchAirQuality(lat: number, lng: number, fetcher?: typeof fetch): Promise<AirQualityResponse>`

- [ ] **Step 1: Add the default MSW handler**

In `tests/mocks/handlers.ts`, add a third entry to the `handlers` array so no suite can reach the live endpoint:

```ts
  http.all("https://air-quality-api.open-meteo.com/*", () =>
    HttpResponse.json({ hourly: { time: [], us_aqi: [] } }, { status: 200 }),
  ),
```

- [ ] **Step 2: Write the failing test**

Create `tests/lib/airQuality.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { fetchAirQuality } from "@/lib/airQuality";

const ENDPOINT = "https://air-quality-api.open-meteo.com/v1/air-quality";

// Shaped like the real response: a contiguous prefix of values then a clean
// null tail, which is what CAMS actually returns (~4.3-5.0 days of forecast
// against a requested 7).
const fixture = {
  hourly: {
    time: ["2026-09-08T00:00", "2026-09-08T01:00", "2026-09-08T02:00", "2026-09-08T03:00"],
    us_aqi: [42, 47, null, null],
  },
};

describe("fetchAirQuality", () => {
  it("requests us_aqi from the air-quality host with the right window", async () => {
    server.use(
      http.get(ENDPOINT, ({ request }) => {
        const p = new URL(request.url).searchParams;
        expect(p.get("latitude")).toBe("37.734");
        expect(p.get("longitude")).toBe("-119.637");
        expect(p.get("hourly")).toBe("us_aqi");
        expect(p.get("timezone")).toBe("auto");
        // 7 is the API's hard cap (8+ is a 400). It returns ~4.3-5 days of real
        // data regardless, but asking for 7 costs nothing and London measured
        // 8 hours beyond what the default of 5 returns.
        expect(p.get("forecast_days")).toBe("7");
        // The panel is forecast-only; past_days=0 starts the response at today
        // 00:00 local, exactly where forecastHourly begins.
        expect(p.get("past_days")).toBe("0");
        return HttpResponse.json(fixture);
      }),
    );

    const air = await fetchAirQuality(37.734, -119.637);
    expect(air.hourly).toHaveLength(4);
    expect(air.hourly[0]).toEqual({ datetime: "2026-09-08T00:00", usAqi: 42 });
  });

  it("preserves the trailing nulls rather than coercing them to zero", async () => {
    // A rendered AQI of 0 is a claim of pristine air, not an absence of data.
    // The panel relies on these nulls to break the line and draw its dead zone.
    server.use(http.get(ENDPOINT, () => HttpResponse.json(fixture)));

    const air = await fetchAirQuality(37.734, -119.637);
    expect(air.hourly.map(h => h.usAqi)).toEqual([42, 47, null, null]);
  });

  it("throws on a non-2xx response so the caller can fall back to null", async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.json({}, { status: 503 })));
    await expect(fetchAirQuality(37.734, -119.637)).rejects.toThrow("503");
  });

  it("returns an empty series when the payload carries no hourly block", async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.json({})));
    const air = await fetchAirQuality(37.734, -119.637);
    expect(air.hourly).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/lib/airQuality.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/airQuality"`.

- [ ] **Step 4: Write the implementation**

Create `lib/airQuality.ts`:

```ts
/**
 * Air quality, from Open-Meteo's separate CAMS-backed endpoint.
 *
 * Deliberately isolated from lib/weather.ts. There is no model stitching here:
 * CAMS has no model-priority walk to run and no per-hour provenance to badge,
 * and the two sources have different horizons and independent failure modes.
 * Callers must treat a failure as non-fatal — the weather page renders without it.
 */

export type HourlyAir = { datetime: string; usAqi: number | null };
export type AirQualityResponse = { hourly: HourlyAir[] };

type OmAirResponse = {
  hourly?: { time: string[]; us_aqi: (number | null)[] };
};

export async function fetchAirQuality(
  lat: number,
  lng: number,
  fetcher: typeof fetch = fetch,
): Promise<AirQualityResponse> {
  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("hourly", "us_aqi");
  url.searchParams.set("timezone", "auto");
  // 7 is the hard cap — forecast_days=8 is a 400. The response still trails off
  // into nulls after ~4.3-5.0 days depending on location; that tail is expected
  // and is what the panel's dead zone draws.
  url.searchParams.set("forecast_days", "7");
  // Forecast-only panel. past_days=0 starts the series at today 00:00 local,
  // which is exactly where sliceWeather's forecastHourly begins.
  url.searchParams.set("past_days", "0");
  // `domains` is left at its default of `auto` (CAMS Europe 11km blended with
  // CAMS global 45km); there is nothing to gain by pinning it.

  const res = await fetcher(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Open-Meteo air quality returned ${res.status}`);

  const j: OmAirResponse = await res.json();
  if (!j.hourly?.time) return { hourly: [] };

  return {
    hourly: j.hourly.time.map((t, i) => ({
      datetime: t,
      // Null is carried through, never defaulted to 0 — see the module comment.
      usAqi: j.hourly!.us_aqi?.[i] ?? null,
    })),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/lib/airQuality.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/airQuality.ts tests/lib/airQuality.test.ts tests/mocks/handlers.ts
git commit -m "feat: fetch US AQI from the Open-Meteo air-quality endpoint

Isolated from lib/weather.ts: CAMS has no model-priority walk to run and
no per-hour provenance to badge, and the two sources have different
horizons and independent failure modes.

forecast_days=7 is the API's hard cap (8 is a 400); the response still
trails into nulls after ~4.3-5.0 days, and those nulls are preserved
rather than coerced to 0 so the panel can break its line there.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `AirQualityPanel`

**Files:**
- Create: `components/AirQualityPanel.tsx`
- Modify: `tests/components/panelAlignment.test.tsx`, `tests/components/panelMemoization.test.tsx`
- Test: `tests/components/AirQualityPanel.test.tsx`

**Interfaces:**
- Consumes: `aqiDomain`, `visibleBands`, `lastCoveredIndex` from `lib/aqiBands` (Task 1); `LEFT_MARGIN` from `lib/panelLayout`.
- Produces: `AirQualityPanel`, a `React.memo`-wrapped component taking
  `{ data: { x: string; aqi: number | null }[]; ticks?: string[]; tickFormatter?: (v: string) => string; onHover?: (index: number) => void; onLeave?: () => void }`.
  **Note the absent `weekendBands` prop** — this is the one panel that does not accept it.

- [ ] **Step 1: Write the failing test**

Create `tests/components/AirQualityPanel.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AirQualityPanel } from "@/components/AirQualityPanel";
import { AQI_AXIS_FLOOR } from "@/lib/aqiBands";

// Recharts' ResponsiveContainer measures 0x0 in jsdom and renders no chart body.
// Give it an explicit size so the legend, line, bands and axes reach the DOM.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <actual.ResponsiveContainer width={800} height={300}>{children}</actual.ResponsiveContainer>
    ),
  };
});

const hours = Array.from({ length: 24 }, (_, i) => `2026-09-08T${String(i).padStart(2, "0")}:00`);

// Clean air with a trailing tail, the shape CAMS actually returns.
const clean = hours.map((x, i) => ({ x, aqi: i < 16 ? 40 : null }));

describe("AirQualityPanel", () => {
  it("renders the AQI series in the legend", () => {
    render(<AirQualityPanel data={clean} />);
    expect(screen.getByText("US AQI")).toBeInTheDocument();
  });

  it("holds the axis at the floor for clean air", () => {
    // The panel's whole reason for a floored ceiling: a 40-AQI day must not be
    // drawn as a full-height line. getByText("100") is unique among the ticks.
    render(<AirQualityPanel data={clean} />);
    expect(screen.getByText(String(AQI_AXIS_FLOOR))).toBeInTheDocument();
  });

  it("draws exactly the two low bands for clean air", () => {
    // A clean crag should be a calm two-tone panel, not a permanent rainbow.
    const { container } = render(<AirQualityPanel data={clean} />);
    expect(container.querySelectorAll('[fill="#00e400"]')).toHaveLength(1);
    expect(container.querySelectorAll('[fill="#ffff00"]')).toHaveLength(1);
    expect(container.querySelectorAll('[fill="#ff7e00"]')).toHaveLength(0);
    expect(container.querySelectorAll('[fill="#ff0000"]')).toHaveLength(0);
  });

  it("reveals the higher bands during a smoke event", () => {
    const smoky = hours.map((x, i) => ({ x, aqi: i < 16 ? 210 : null }));
    const { container } = render(<AirQualityPanel data={smoky} />);
    expect(container.querySelectorAll('[fill="#ff7e00"]')).toHaveLength(1);
    expect(container.querySelectorAll('[fill="#ff0000"]')).toHaveLength(1);
    expect(container.querySelectorAll('[fill="#8f3f97"]')).toHaveLength(1);
  });

  it("shades the hours the forecast does not reach", () => {
    const { container } = render(<AirQualityPanel data={clean} />);
    expect(container.querySelectorAll('[fill="#6b7280"]')).toHaveLength(1);
  });

  it("draws no dead zone when the series covers the whole window", () => {
    const full = hours.map(x => ({ x, aqi: 40 }));
    const { container } = render(<AirQualityPanel data={full} />);
    expect(container.querySelectorAll('[fill="#6b7280"]')).toHaveLength(0);
  });

  it("never renders weekend bands", () => {
    // Deliberate: the weekend band is amber, which on an AQI chart is the colour
    // of "Unhealthy for sensitive groups". A reader could take the amber Saturday
    // column for pollution. The weekend cue is carried by the five panels above.
    const { container } = render(<AirQualityPanel data={clean} />);
    expect(container.querySelectorAll('[fill="#f59e0b"]')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/AirQualityPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/AirQualityPanel"`.

- [ ] **Step 3: Write the implementation**

Create `components/AirQualityPanel.tsx`:

```tsx
"use client";
import { memo } from "react";
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
import { LEFT_MARGIN } from "@/lib/panelLayout";
import { aqiDomain, lastCoveredIndex, visibleBands } from "@/lib/aqiBands";

// No `weekendBands` prop, and that is deliberate — this is the one panel in the
// stack that does not take one. The weekend band is amber (#f59e0b), which on an
// AQI chart is the colour of "Unhealthy for sensitive groups": a reader scanning
// the amber Saturday column could read it as pollution. That is a semantic
// collision, not merely a muddy overlap, and it is worse than the amber-on-amber
// problem DewPointPanel dodged by switching to sky/rose. The weekend cue is still
// carried by the five panels directly above, on the same x-axis. Accepting the
// prop and ignoring it would be worse than omitting it: a caller would pass it
// and wonder why nothing rendered.
interface AirQualityPanelProps {
  data: { x: string; aqi: number | null }[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
  onHover?: (index: number) => void;
  onLeave?: () => void;
}

function AirQualityPanelImpl({
  data, ticks, tickFormatter, onHover, onLeave,
}: AirQualityPanelProps) {
  function hover(label: unknown) {
    if (label === undefined || !onHover) return;
    const idx = data.findIndex(d => d.x === String(label));
    if (idx >= 0) onHover(idx);
  }

  const values = data.map(d => d.aqi);
  const [lo, hi] = aqiDomain(values);
  const bands = visibleBands(hi);

  // CAMS coverage is a contiguous prefix then a clean null tail, so one index
  // marks where the forecast stops and the dead zone begins.
  const covered = lastCoveredIndex(values);
  const deadStart = covered >= 0 && covered < data.length - 1 ? data[covered + 1].x : null;

  return (
    // No right-hand axis, so margin.right must be 80 to match TempPanel,
    // WindPanel, DewPointPanel and HumidityPanel. Recharts insets the plot by
    // margin.right PLUS any right-oriented axis width, which is why PrecipPanel
    // uses 32 against its 48px axis. Getting this wrong silently drifts the panel
    // out of register with the stack; panelAlignment.test.tsx guards it.
    <ResponsiveContainer width="100%" height={150}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 80, bottom: 16, left: LEFT_MARGIN }}
        onMouseMove={(s) => hover(s.activeLabel)}
        onTouchMove={(s) => hover(s.activeLabel)}
        onTouchStart={(s) => hover(s.activeLabel)}
        onMouseLeave={onLeave}
        onTouchEnd={onLeave}
      >
        {/* EPA category bands, emitted first so they paint behind everything —
            SVG has no z-index, so a band declared after the line would tint the
            series the reader is trying to trace. Only the bands the axis
            actually reaches are drawn, so a clean crag is a calm two-tone panel
            and a smoke event lights the upper bands up. */}
        {bands.map(b => (
          <ReferenceArea key={`aqi-${b.min}`} y1={b.min} y2={b.max}
            fill={b.fill} fillOpacity={0.1} stroke="none" />
        ))}

        {/* The hours CAMS does not forecast. Stated rather than left as an
            ambiguous blank — the same instinct as the history chart's partial-day
            marker. The matching caption is rendered by ForecastChart. */}
        {deadStart && (
          <ReferenceArea x1={deadStart} x2={data[data.length - 1].x}
            fill="#6b7280" fillOpacity={0.12} stroke="none" />
        )}

        <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />

        <XAxis dataKey="x" ticks={ticks} tickFormatter={tickFormatter} />
        <YAxis domain={[lo, hi]} label={{ value: "AQI", angle: -90, position: "insideLeft" }} />
        <Legend />
        <Tooltip content={() => null} />

        {/* Dark neutral so the line stays readable over the coloured bands.
            connectNulls={false} is the entire gap-handling requirement: the
            nulls are a clean trailing tail with no interior gaps. */}
        <Line dataKey="aqi" name="US AQI" stroke="#3f3f46" strokeWidth={2}
          dot={false} connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export const AirQualityPanel = memo(AirQualityPanelImpl);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/AirQualityPanel.test.tsx`
Expected: PASS — 7 tests.

- [ ] **Step 5: Add the panel to the two stack-wide guards**

In `tests/components/panelAlignment.test.tsx`: add the import
`import { AirQualityPanel } from "@/components/AirQualityPanel";`, rename the test title
from `"gives all five stacked panels the same horizontal x-axis extent"` to
`"gives all six stacked panels the same horizontal x-axis extent"`, and add inside it:

```tsx
    const airData = hours.map(x => ({ x, aqi: 40 as number | null }));
    const air = render(<AirQualityPanel data={airData} />);
    const airExtent = xAxisExtent(air.container);
    expect(airExtent).toEqual(tempExtent);
```

In `tests/components/panelMemoization.test.tsx`: add the same import and a sixth row to the
`it.each` table:

```tsx
    ["AirQualityPanel", AirQualityPanel],
```

- [ ] **Step 6: Run both guards**

Run: `npx vitest run tests/components/panelAlignment.test.tsx tests/components/panelMemoization.test.tsx`
Expected: PASS. The alignment assertion is the regression guard for the margin rule — if it
fails, `margin.right` is not 80.

- [ ] **Step 7: Commit**

```bash
git add components/AirQualityPanel.tsx tests/components/AirQualityPanel.test.tsx \
        tests/components/panelAlignment.test.tsx tests/components/panelMemoization.test.tsx
git commit -m "feat: add the air quality panel

Panel 6: US AQI against clamped EPA category bands, with the hours CAMS
does not forecast shaded as an explicit dead zone rather than left blank.

It is the one panel that does not accept weekendBands. The weekend band is
amber, which on an AQI chart is the colour of Unhealthy for sensitive
groups, so an amber Saturday column could be read as pollution.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Thread `air` through `WeatherView` into `ForecastChart`

**Files:**
- Modify: `components/WeatherView.tsx`, `components/ForecastChart.tsx`
- Test: `tests/components/ForecastChart.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `AirQualityResponse` (Task 2); `AirQualityPanel` (Task 3); `aqiCategory`, `lastCoveredIndex`, `formatAqiCutoff` (Task 1).
- Produces: `WeatherView` and `ForecastChart` both accept an optional `air?: AirQualityResponse | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/ForecastChart.test.tsx` (if the file already exists, append the
`describe` block instead of recreating it):

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ForecastChart } from "@/components/ForecastChart";
import type { HourlyWeather } from "@/lib/weather";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <actual.ResponsiveContainer width={800} height={300}>{children}</actual.ResponsiveContainer>
    ),
  };
});

const hourly: HourlyWeather[] = Array.from({ length: 24 }, (_, i) => ({
  datetime: `2026-09-08T${String(i).padStart(2, "0")}:00`,
  temp: 15, feelsLike: 14, dewPoint: 4, humidity: 55,
  precip: 0, precipChance: 10, windSpeed: 3, windGust: 5,
}));

// AQ stops well before the weather window ends — the real shape.
const air = {
  hourly: hourly.slice(0, 7).map((h, i) => ({ datetime: h.datetime, usAqi: 40 + i })),
};

describe("ForecastChart air quality", () => {
  it("renders the panel and names the cutoff hour when AQ is present", () => {
    render(<ForecastChart hourly={hourly} air={air} />);
    expect(screen.getByText("US AQI")).toBeInTheDocument();
    // Last covered hour is index 6 -> 06:00.
    expect(screen.getByText(/8 Sep, 06:00/)).toBeInTheDocument();
  });

  it("states the resolution caveat", () => {
    // The honest answer to the 45km objection; it is not optional copy.
    render(<ForecastChart hourly={hourly} air={air} />);
    expect(screen.getByText(/45 km/)).toBeInTheDocument();
  });

  it("renders no panel, note or explainer when AQ is unavailable", () => {
    render(<ForecastChart hourly={hourly} air={null} />);
    expect(screen.queryByText("US AQI")).toBeNull();
    expect(screen.queryByText(/45 km/)).toBeNull();
    // The rest of the stack is untouched.
    expect(screen.getByText("Temp (°C)")).toBeInTheDocument();
  });

  it("renders no panel when every AQ value is null", () => {
    const empty = { hourly: hourly.map(h => ({ datetime: h.datetime, usAqi: null })) };
    render(<ForecastChart hourly={hourly} air={empty} />);
    expect(screen.queryByText("US AQI")).toBeNull();
  });

  it("omits the cutoff note when AQ covers the whole window", () => {
    const full = { hourly: hourly.map(h => ({ datetime: h.datetime, usAqi: 40 })) };
    render(<ForecastChart hourly={hourly} air={full} />);
    expect(screen.getByText("US AQI")).toBeInTheDocument();
    expect(screen.queryByText(/does not forecast further ahead/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/ForecastChart.test.tsx`
Expected: FAIL — `ForecastChart` does not accept an `air` prop, so "US AQI" is never found.

- [ ] **Step 3: Update `ForecastChart`**

Add the imports:

```tsx
import type { AirQualityResponse } from "@/lib/airQuality";
import { AirQualityPanel } from "@/components/AirQualityPanel";
import { aqiCategory, formatAqiCutoff, lastCoveredIndex } from "@/lib/aqiBands";
```

Change the signature and add `aqi` to `ActivePoint`:

```tsx
type ActivePoint = {
  // …existing fields unchanged…
  aqi: number | null;
};

export function ForecastChart({
  hourly,
  air,
}: {
  hourly: HourlyWeather[];
  air?: AirQualityResponse | null;
}) {
```

Add the memos after `humidityData` (every one of these must be memoised — the stack's
anti-jank contract is React.memo on the panels *plus* stable props from here):

```tsx
  // Joined to the weather hours by exact datetime rather than by position: both
  // calls use timezone=auto at the same coordinates, so the local wall-clock
  // strings match hour for hour. Mapping over `hourly` (not over air.hourly) is
  // what makes the panel's x-axis identical by construction to the five panels
  // above — same length, same x values, same ticks — which is why it can join
  // panelAlignment.test.tsx. It also means the day-window slice propagates for
  // free: `hourly` is already sliced, so AQ needs no slicing of its own.
  const aqiByHour = useMemo(
    () => air ? new Map(air.hourly.map(a => [a.datetime, a.usAqi])) : null,
    [air],
  );

  const aqiData = useMemo(
    () => hourly.map(h => ({ x: h.datetime, aqi: aqiByHour?.get(h.datetime) ?? null })),
    [hourly, aqiByHour],
  );

  // CAMS reaches only ~4.3-5.0 days against a 7/10/15-day window, so the panel
  // is normally partly empty. `covered` marks the last hour it reaches: -1 means
  // there is nothing to show at all and the whole section is dropped.
  const aqiCovered = useMemo(() => lastCoveredIndex(aqiData.map(d => d.aqi)), [aqiData]);
  const showAqi = aqiCovered >= 0;
  const aqiCutoff = showAqi && aqiCovered < aqiData.length - 1 ? aqiData[aqiCovered].x : null;
```

Extend `handleHover` to carry the AQI value:

```tsx
      aqi: aqiData[idx]?.aqi ?? null,
```

and change its dependency array to `[hourly, aqiData]`.

Add the strip span after the gust span, coloured by category:

```tsx
            {activePoint.aqi !== null && (
              <span style={{ color: aqiCategory(activePoint.aqi).fill }}>
                AQI {activePoint.aqi}
              </span>
            )}
```

Finally add the panel and its two notes after `<HumidityPanel … />`:

```tsx
          {showAqi && (
            <>
              <AirQualityPanel
                data={aqiData}
                ticks={dayTicks}
                tickFormatter={fmt}
                onHover={handleHover}
                onLeave={clear}
              />
              {aqiCutoff && (
                <p className="chart-note">
                  Air-quality forecast ends <strong>{formatAqiCutoff(aqiCutoff)}</strong>.
                  CAMS does not forecast further ahead — the shaded hours have no data.
                </p>
              )}
              <p className="chart-note">
                <strong>US AQI</strong> combines several pollutants into one 0–500 scale;
                at a crag the thing that usually moves it is wildfire smoke. Under 50 is
                clean air. The forecast comes from CAMS at ~45 km resolution, so it will
                not resolve a valley inversion or a single plume — nearby crags read the
                same, and local smoke can be much worse than shown.
              </p>
            </>
          )}
```

Note the panel gets **no `weekendBands` prop** — it does not accept one.

- [ ] **Step 4: Update `WeatherView` to forward `air`**

In `components/WeatherView.tsx`, add the import
`import type { AirQualityResponse } from "@/lib/airQuality";`, extend the props:

```tsx
export function WeatherView({
  weather,
  air,
}: {
  weather: { daily: DailyWeather[]; hourly: HourlyWeather[] };
  air?: AirQualityResponse | null;
}) {
```

and pass it through — **without touching `sliceWeather`**:

```tsx
        <ForecastChart hourly={forecastHourly} air={air} />
```

Add a brief comment above that line:

```tsx
        {/* `air` is forwarded unsliced: ForecastChart looks AQ up per weather
            hour, so the day-window slice already applied to forecastHourly
            propagates to it. Slicing it separately would be a second source of
            truth for the window. */}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/components/ForecastChart.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 6: Run the whole component suite for regressions**

Run: `npx vitest run tests/components/`
Expected: PASS. Watch `panelAlignment` and `panelMemoization` in particular.

- [ ] **Step 7: Commit**

```bash
git add components/ForecastChart.tsx components/WeatherView.tsx tests/components/ForecastChart.test.tsx
git commit -m "feat: wire the air quality panel into the forecast stack

The AQ series is built by mapping over the weather hours and looking CAMS
up by datetime, so the panel's x-axis is identical by construction to the
five above it and the day-window slice propagates for free.

When AQ is missing or entirely null the panel, its cutoff note and its
explainer all render nothing rather than leaving an empty 150px box.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Fetch air quality at both call sites

**Files:**
- Modify: `app/api/route/[id]/route.ts`, `app/route/[id]/page.tsx`, `app/at/[coords]/page.tsx`
- Test: `tests/components/GpsWeatherPage.test.tsx`, `tests/api/route.test.ts`

**Interfaces:**
- Consumes: `fetchAirQuality`, `AirQualityResponse` (Task 2); `WeatherView`'s `air` prop (Task 4).
- Produces: the route API body becomes `{ route, weather, air }`.

- [ ] **Step 1: Write the failing test for the GPS page**

Append to `tests/components/GpsWeatherPage.test.tsx`. First add the hoisted mock beside the
existing `fetchWeatherMock` block, near the top of the file:

```tsx
const fetchAirQualityMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/airQuality", () => ({ fetchAirQuality: fetchAirQualityMock }));
```

Add `fetchAirQualityMock.mockReset();` to the existing `beforeEach`, then add these cases
inside the `describe("GpsWeatherPage", …)` block:

```tsx
  it("renders the full weather stack when the air quality fetch fails", async () => {
    // AQ lives on a second endpoint with an independent failure mode. It must
    // never be able to blank the weather page.
    fetchWeatherMock.mockResolvedValue(fixture);
    fetchAirQualityMock.mockRejectedValue(new Error("CAMS down"));

    render(await GpsWeatherPage({ params: Promise.resolve({ coords: "37.7340,-119.6370" }) }));

    expect(screen.getByRole("button", { name: "7d" })).toBeInTheDocument();
    expect(screen.queryByText("Weather unavailable. Please refresh.")).toBeNull();
  });

  it("requests air quality for the same coordinates as the weather", async () => {
    fetchWeatherMock.mockResolvedValue(fixture);
    fetchAirQualityMock.mockResolvedValue({ hourly: [] });

    render(await GpsWeatherPage({ params: Promise.resolve({ coords: "37.7340,-119.6370" }) }));

    expect(fetchAirQualityMock).toHaveBeenCalledWith(37.734, -119.637);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/GpsWeatherPage.test.tsx`
Expected: FAIL — `fetchAirQualityMock` is never called (0 calls).

- [ ] **Step 3: Update `app/at/[coords]/page.tsx`**

Add the import:

```tsx
import { fetchAirQuality, type AirQualityResponse } from "@/lib/airQuality";
```

Replace the existing `let weather … try/catch` block with a concurrent pair:

```tsx
  // Run concurrently so air quality never adds to weather latency, and catch
  // each independently: air quality is a second endpoint with its own failure
  // mode and must never be able to blank the weather page. Promise.all over
  // already-caught promises, so neither rejection can settle the pair.
  const [weather, air] = await Promise.all([
    fetchWeather(lat, lng).catch((err): WeatherResponse | null => {
      console.error(`fetchWeather failed for GPS (${lat},${lng}):`, err);
      return null;
    }),
    fetchAirQuality(lat, lng).catch((err): AirQualityResponse | null => {
      console.error(`fetchAirQuality failed for GPS (${lat},${lng}):`, err);
      return null;
    }),
  ]);
```

and pass it down:

```tsx
        <WeatherView weather={weather} air={air} />
```

- [ ] **Step 4: Run the GPS page test**

Run: `npx vitest run tests/components/GpsWeatherPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the route API**

Add to `tests/api/route.test.ts`, inside the existing top-level `describe`:

```ts
  it("returns an air field alongside weather", async () => {
    await testDb.insert(routes).values({ id: 1, slug: "the-nose", name: "The Nose" });
    await testDb.insert(routeMeta).values({
      id: 1, lat: 37.734, lng: -119.637, areaPath: "Yosemite", grade: "5.9",
      fetchedAt: new Date(),
    });
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () =>
        HttpResponse.json(omMultiFixture),
      ),
      http.get("https://air-quality-api.open-meteo.com/v1/air-quality", () =>
        HttpResponse.json({
          hourly: { time: ["2026-09-08T00:00"], us_aqi: [42] },
        }),
      ),
    );

    const res = await GET(new Request("http://x/api/route/1"), {
      params: Promise.resolve({ id: "1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.air.hourly[0]).toEqual({ datetime: "2026-09-08T00:00", usAqi: 42 });
  });

  it("still returns weather when the air quality endpoint fails", async () => {
    await testDb.insert(routes).values({ id: 1, slug: "the-nose", name: "The Nose" });
    await testDb.insert(routeMeta).values({
      id: 1, lat: 37.734, lng: -119.637, areaPath: "Yosemite", grade: "5.9",
      fetchedAt: new Date(),
    });
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () =>
        HttpResponse.json(omMultiFixture),
      ),
      http.get("https://air-quality-api.open-meteo.com/v1/air-quality", () =>
        HttpResponse.json({}, { status: 503 }),
      ),
    );

    const res = await GET(new Request("http://x/api/route/1"), {
      params: Promise.resolve({ id: "1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.air).toBeNull();
    expect(body.weather.hourly.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/api/route.test.ts`
Expected: FAIL — `body.air` is `undefined`.

Requires Postgres: `docker compose up -d`.

- [ ] **Step 7: Update `app/api/route/[id]/route.ts`**

Add the import:

```ts
import { fetchAirQuality, type AirQualityResponse } from "@/lib/airQuality";
```

Replace the existing `let weather … try/catch` block (which sits after the `activeMeta`
guard) with:

```ts
  // Concurrent, independently caught: air quality is a second endpoint with its
  // own failure mode and must never be able to blank the weather page.
  const [weather, air] = await Promise.all([
    fetchWeather(activeMeta.lat, activeMeta.lng).catch((err): WeatherResponse | null => {
      console.error(`fetchWeather failed for route ${id} (${activeMeta!.lat},${activeMeta!.lng}):`, err);
      return null;
    }),
    fetchAirQuality(activeMeta.lat, activeMeta.lng).catch((err): AirQualityResponse | null => {
      console.error(`fetchAirQuality failed for route ${id}:`, err);
      return null;
    }),
  ]);
```

and add `air` to the JSON body, beside `weather`:

```ts
      weather,
      air,
```

- [ ] **Step 8: Update `app/route/[id]/page.tsx`**

Extend the `ApiResponse` type with the new field:

```tsx
  air: import("@/lib/airQuality").AirQualityResponse | null;
```

Change the destructure and the render:

```tsx
  const { route, weather, air } = data;
```

```tsx
        <WeatherView weather={weather} air={air} />
```

- [ ] **Step 9: Run both suites**

Run: `npx vitest run tests/api/route.test.ts tests/components/GpsWeatherPage.test.tsx tests/components/RoutePage.test.tsx`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add app/api/route/\[id\]/route.ts app/route/\[id\]/page.tsx app/at/\[coords\]/page.tsx \
        tests/api/route.test.ts tests/components/GpsWeatherPage.test.tsx
git commit -m "feat: fetch air quality alongside weather at both call sites

Runs concurrently so AQ never adds to weather latency, with each promise
caught independently so the second endpoint's failure mode cannot blank
the weather page. The route API body gains a sibling air field.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Verify the whole suite and update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Run the full suite and the linter**

Run: `npm test` then `npm run lint` then `npm run build`.
Expected: all pass. Requires `docker compose up -d`.

If anything fails here, fix it before touching the docs — do not document a broken build.

- [ ] **Step 2: Update the panel table and key files in `CLAUDE.md`**

In the **Key files** section, change the `ForecastChart` line to say it renders **six**
panels, and add these entries after the `HumidityPanel` line:

```markdown
- `components/AirQualityPanel.tsx` — panel 6 (150px): US AQI on an axis floored at `AQI_AXIS_FLOOR` (100), against clamped EPA category bands, plus a grey `ReferenceArea` over the hours CAMS does not forecast. **It is the only panel that does not accept `weekendBands`** — the weekend band is amber, which on an AQI chart is the colour of "Unhealthy for sensitive groups", so an amber Saturday column reads as pollution. Accepting and ignoring the prop would be worse than omitting it. Bands are emitted before the grid and line (SVG has no z-index) and only where they intersect the domain, so a clean crag is a calm two-tone panel rather than a permanent rainbow
- `lib/aqiBands.ts` — `AQI_BANDS` (EPA breakpoints, contiguous so the rendered areas leave no gap), `aqiDomain`, `aqiCategory`, `visibleBands`, `lastCoveredIndex`, `formatAqiCutoff`. `aqiDomain` keeps zero as the lower bound — AQI is a ratio scale, unlike temperature — and floors the ceiling at 100 for the `MM_AXIS_FLOOR` reason: measured clean-air crags sit at 17–52, so an auto-fitted axis draws a "Good" day as a full-height line and the scale shifts between crags and between the 7/10/15-day windows. `formatAqiCutoff` reads the timestamp positionally, never via `new Date` (crag-local wall clock)
- `lib/airQuality.ts` — `fetchAirQuality`: the second Open-Meteo endpoint. See "Air quality" below
```

Amend the sentence beginning "All five panels share one props shape" to read:

```markdown
Panels 1–5 share one props shape (`data`, `ticks`, `tickFormatter`, `weekendBands`, `onHover`, `onLeave`) so the history section can adopt them later without modification. `AirQualityPanel` shares it minus `weekendBands`, for the reason given above.
```

Also update the two places that say "five panels" in the margin-rule paragraph to "six", and
the `panelAlignment.test.tsx` sentence to say it renders all six.

- [ ] **Step 3: Add an "Air quality" section to `CLAUDE.md`**

Insert after the **Multi-model weather stitching** section:

```markdown
## Air quality

`lib/airQuality.ts` calls a **second host** — `air-quality-api.open-meteo.com` — for
`us_aqi` only. It is deliberately isolated from `lib/weather.ts`: CAMS has no model-priority
walk to run and no per-hour provenance to badge, so `stitchModels` is not involved. The
result travels as a **sibling `air` field** beside `weather`, never folded into
`HourlyWeather`.

**It must never be able to break the weather page.** Both call sites fetch it concurrently
with the weather and catch each promise independently (`Promise.all` over already-caught
promises). A failure yields `air: null`, and `ForecastChart` then renders no panel, no cutoff
note and no explainer — not an empty 150px box.

**The forecast horizon is ~4.3–5.0 days, and `forecast_days` is capped at 7** (8 or more is
a `400`). Measured on 2026-09-08: Yosemite / Portland / LA reached 4.3 days, London 4.6,
Sydney 5.0. So the panel is blank for the last ~2.5 days of the 7-day window and roughly
two-thirds of the 15-day window. That gap is **drawn and captioned** as a dead zone rather
than left as an ambiguous blank.

**Nulls are a clean trailing tail** — verified across every variable, zero interior gaps —
so `connectNulls={false}` is the entire gap-handling requirement. Values are interpolated to
true hourly despite the global domain's 3-hourly native cadence, so a line reads correctly.

**AQ is never sliced.** `WeatherView` forwards `air` untouched and `ForecastChart` joins it
to the weather hours by exact `datetime` lookup. Both calls use `timezone=auto` at the same
coordinates, so the local wall-clock strings match hour for hour. Mapping over `hourly`
rather than over `air.hourly` is what makes the panel's x-axis identical by construction to
the five above it, and it means the day-window slice propagates for free. `lib/sliceWeather.ts`
is not involved.

**Resolution is ~45 km** (CAMS global; CAMS Europe is 11 km, blended by `domains=auto`).
That will not resolve a valley inversion or a single plume, so nearby crags read the same.
The explainer note under the panel states this — it is the honest caveat, not optional copy.

This doubles outbound Open-Meteo calls per page view and both hosts draw on the same
free-tier non-commercial allowance. The AQ call sits inside the existing
`Cache-Control: max-age=600` / `revalidate = 600`, already far tighter than CAMS' 12-hour
(global) / 24-hour (Europe) update cycle.
```

- [ ] **Step 4: Add the testing gotcha**

In the **Testing** section, add:

```markdown
- MSW's default handlers cover `air-quality-api.open-meteo.com` as well as `api.open-meteo.com` — they are separate hosts, so a suite that only overrides the forecast host still needs the air-quality default to avoid a live call.
- `GpsWeatherPage` / `RoutePage` tests mock `@/lib/airQuality` alongside `@/lib/weather`; both mocks are hoisted.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the air quality endpoint and panel 6 in CLAUDE.md

Captures the constraints that are not obvious from the code: the ~4.3-5.0
day CAMS horizon against a 15-day selector, the clean-trailing-tail null
shape, why AQ is joined by datetime rather than sliced, and why panel 6
is the one panel without weekendBands.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 Data layer, `fetchAirQuality`, params, null preservation | 2 |
| §1 Call sites, concurrent + independently caught | 5 |
| §1 Response shape `{ route, weather, air }` | 5 |
| §2 Threading, unsliced, `sliceWeather` untouched | 4 |
| §2 Lookup by datetime, alignment by construction | 4 |
| §3 `AQI_BANDS`, `AQI_AXIS_FLOOR`, `AQI_PAD`, `aqiDomain`, `aqiCategory`, `visibleBands` | 1 |
| §4 Panel, bands before grid, no weekend bands, `margin.right: 80` | 3 |
| §4 Dead zone band | 3 |
| §4 Dead-zone caption, absent-data case | 4 |
| §5 Tooltip strip span, explainer with 45 km caveat | 4 |
| §6 All listed test files | 1, 2, 3, 4, 5 |
| §7 Files touched | all |
| §8 Request budget (no code change; documented) | 6 |

No gaps.

**Type consistency:** `AirQualityResponse` / `HourlyAir` (Task 2) are the exact names imported
in Tasks 4 and 5. `aqiDomain`, `aqiCategory`, `visibleBands`, `lastCoveredIndex`,
`formatAqiCutoff` (Task 1) match their uses in Tasks 3 and 4. The panel's `data` shape
`{ x, aqi }` is produced by `aqiData` in Task 4 and consumed in Task 3. `AirQualityPanel`
takes no `weekendBands` in Task 3 and is given none in Task 4.

**Known deviation from the stack's conventions**, recorded deliberately in both the code
comment and `CLAUDE.md`: `AirQualityPanel` does not take `weekendBands`, so it is not a drop-in
for the shared panel props shape. Task 6 updates the CLAUDE.md sentence that currently claims
all panels share one shape.
