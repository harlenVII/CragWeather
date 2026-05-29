# Arbitrary GPS Coordinates in Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users look up, save, and share a 14-day weather window for an arbitrary GPS location entered in the search box (decimal / DMS / map-app URL) or via a `?q=` deep link.

**Architecture:** A new pure parser (`lib/parseCoords.ts`) turns coordinate text into `{lat,lng}`; a thin classifier (`lib/searchTarget.ts`) decides MP-route vs. coords vs. nothing. The saved-route model becomes a discriminated union (MP | GPS) keyed by a `routeKey()` helper so GPS points coexist with MP routes in favorites and shared lists. A new `/at/[coords]` server page renders the same `WeatherView` by calling `fetchWeather(lat,lng)` directly.

**Tech Stack:** Next.js App Router (server + client components), TypeScript, Drizzle (types only here), Vitest + Testing Library + MSW.

**Conventions for this codebase:**
- Path alias `@/` → repo root.
- Run a single test file: `npx vitest run tests/path/to/file.test.ts` (no Docker/DB needed for any test in this plan — none of these files import `@/lib/db`).
- Commit after each task with a conventional-commit message.
- Spec: `docs/superpowers/specs/2026-05-29-arbitrary-gps-search-design.md`.

---

## File Structure

**New files:**
- `lib/parseCoords.ts` — pure coordinate parsing/formatting (`parseCoords`, `formatCoords`, `coordsPath`).
- `lib/searchTarget.ts` — `parseSearchTarget` (MP regex → `parseCoords`), centralizes the duplicated MP regex.
- `app/at/[coords]/page.tsx` — GPS weather page (server component).
- `app/at/[coords]/loading.tsx`, `app/at/[coords]/not-found.tsx` — mirror the route-page siblings.
- Test files mirroring each of the above.

**Modified files:**
- `lib/favorites.ts` — `SavedRoute` union + `routeKey`; `isSaved`/`toggle`/`remove` keyed by `routeKey`.
- `lib/schema.ts` — `SavedRouteJson` union.
- `lib/list-validation.ts` — accept GPS shape.
- `components/SaveButton.tsx` — GPS variant.
- `components/SavedRoutes.tsx`, `app/list/[id]/ConfirmJoin.tsx` — render by kind, key by `routeKey`.
- `components/SearchBox.tsx` — use `parseSearchTarget`; coords dropdown row.
- `app/page.tsx` — `?q=` (and legacy `?mp=`) via `parseSearchTarget`.
- `CLAUDE.md` — document the feature.

---

## Task 1: Coordinate parser — `lib/parseCoords.ts`  [model: claude-sonnet-4-6]

**Files:**
- Create: `lib/parseCoords.ts`
- Test: `tests/lib/parseCoords.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/parseCoords.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCoords, formatCoords, coordsPath } from "@/lib/parseCoords";

describe("parseCoords — decimal pairs", () => {
  it("parses comma-separated signed decimals (source raw)", () => {
    expect(parseCoords("37.734, -119.637")).toEqual({ lat: 37.734, lng: -119.637, source: "raw" });
  });
  it("parses space-separated decimals", () => {
    expect(parseCoords("37.734 -119.637")).toEqual({ lat: 37.734, lng: -119.637, source: "raw" });
  });
  it("parses hemisphere letters and applies sign", () => {
    expect(parseCoords("37.734 N, 119.637 W")).toEqual({ lat: 37.734, lng: -119.637, source: "raw" });
  });
  it("reorders by hemisphere when longitude is given first", () => {
    expect(parseCoords("119.637 W, 37.734 N")).toEqual({ lat: 37.734, lng: -119.637, source: "raw" });
  });
  it("handles a southern/eastern point", () => {
    expect(parseCoords("-33.8688, 151.2093")).toEqual({ lat: -33.8688, lng: 151.2093, source: "raw" });
  });
});

describe("parseCoords — DMS", () => {
  it("parses degrees-minutes-seconds with hemispheres", () => {
    const r = parseCoords(`37°44'02"N 119°38'13"W`)!;
    expect(r.source).toBe("raw");
    expect(r.lat).toBeCloseTo(37.7339, 3);
    expect(r.lng).toBeCloseTo(-119.6369, 3);
  });
  it("parses DMS without seconds", () => {
    const r = parseCoords(`37°44'N 119°38'W`)!;
    expect(r.lat).toBeCloseTo(37.7333, 3);
    expect(r.lng).toBeCloseTo(-119.6333, 3);
  });
});

describe("parseCoords — map URLs (source url)", () => {
  it("parses Google @lat,lng", () => {
    expect(parseCoords("https://www.google.com/maps/@37.734,-119.637,15z"))
      .toEqual({ lat: 37.734, lng: -119.637, source: "url" });
  });
  it("parses Google !3d!4d", () => {
    expect(parseCoords("https://www.google.com/maps/place/X/data=!3d37.734!4d-119.637"))
      .toEqual({ lat: 37.734, lng: -119.637, source: "url" });
  });
  it("parses ?q=lat,lng", () => {
    expect(parseCoords("https://maps.google.com/?q=37.734,-119.637"))
      .toEqual({ lat: 37.734, lng: -119.637, source: "url" });
  });
  it("parses Apple ?ll=lat,lng", () => {
    expect(parseCoords("https://maps.apple.com/?ll=37.734,-119.637&z=15"))
      .toEqual({ lat: 37.734, lng: -119.637, source: "url" });
  });
});

describe("parseCoords — rejections", () => {
  it("returns null for plain text", () => {
    expect(parseCoords("the nose")).toBeNull();
  });
  it("returns null for out-of-range latitude", () => {
    expect(parseCoords("91, 10")).toBeNull();
  });
  it("returns null for out-of-range longitude", () => {
    expect(parseCoords("10, 181")).toBeNull();
  });
  it("returns null for a single number", () => {
    expect(parseCoords("37.734")).toBeNull();
  });
  it("returns null for empty input", () => {
    expect(parseCoords("   ")).toBeNull();
  });
  it("returns null for shortened map links", () => {
    expect(parseCoords("https://maps.app.goo.gl/abc123")).toBeNull();
  });
});

describe("formatCoords / coordsPath", () => {
  it("formatCoords rounds to 4 decimals with comma+space", () => {
    expect(formatCoords(37.73395, -119.63699)).toBe("37.7340, -119.6370");
  });
  it("coordsPath rounds to 4 decimals with no space", () => {
    expect(coordsPath(37.73395, -119.63699)).toBe("37.7340,-119.6370");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/parseCoords.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/parseCoords"`.

- [ ] **Step 3: Write the implementation**

Create `lib/parseCoords.ts`:

```ts
export type ParsedCoords = { lat: number; lng: number; source: "url" | "raw" };

const LAT_MIN = -90, LAT_MAX = 90, LNG_MIN = -180, LNG_MAX = 180;

function inRange(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= LAT_MIN && lat <= LAT_MAX &&
    lng >= LNG_MIN && lng <= LNG_MAX
  );
}

/** Human-readable, e.g. "37.7340, -119.6370". Used for display and dedup keys. */
export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/** URL-path-safe (no space), e.g. "37.7340,-119.6370". Used in /at/<coords> links. */
export function coordsPath(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function parseUrl(input: string): ParsedCoords | null {
  // Google place URLs: @lat,lng
  let m = input.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) {
    const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    if (inRange(lat, lng)) return { lat, lng, source: "url" };
  }
  // Google data param: !3dLAT!4dLNG
  m = input.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (m) {
    const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    if (inRange(lat, lng)) return { lat, lng, source: "url" };
  }
  // Query params: ?q= / ?ll= / &sll= / &center= / &daddr= (Google + Apple)
  m = input.match(/[?&](?:q|ll|sll|center|daddr)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (m) {
    const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    if (inRange(lat, lng)) return { lat, lng, source: "url" };
  }
  return null;
}

function parseDms(input: string): ParsedCoords | null {
  // D°M'[S"]? H  (seconds optional). Matches each lat/lng component.
  const DMS = /(\d+)\s*°\s*(\d+)\s*['′]\s*(?:([\d.]+)\s*["″]?)?\s*([NSEW])/gi;
  const matches = [...input.matchAll(DMS)];
  if (matches.length !== 2) return null;

  let lat: number | undefined, lng: number | undefined;
  for (const m of matches) {
    const deg = parseFloat(m[1]);
    const min = parseFloat(m[2]);
    const sec = m[3] ? parseFloat(m[3]) : 0;
    const hemi = m[4].toUpperCase();
    let val = deg + min / 60 + sec / 3600;
    if (hemi === "S" || hemi === "W") val = -val;
    if (hemi === "N" || hemi === "S") lat = val; else lng = val;
  }
  if (lat === undefined || lng === undefined || !inRange(lat, lng)) return null;
  return { lat, lng, source: "raw" };
}

function parseDecimal(input: string): ParsedCoords | null {
  const tokens = [...input.matchAll(/([+-]?\d+(?:\.\d+)?)\s*°?\s*([NSEW])?/gi)]
    .map((m) => ({ value: parseFloat(m[1]), hemi: m[2]?.toUpperCase() }))
    .filter((t) => Number.isFinite(t.value));
  if (tokens.length !== 2) return null;

  let lat: number | undefined, lng: number | undefined;
  // Hemisphere-tagged tokens first (they disambiguate order).
  for (const t of tokens) {
    if (t.hemi === "N" || t.hemi === "S") lat = t.hemi === "S" ? -Math.abs(t.value) : Math.abs(t.value);
    else if (t.hemi === "E" || t.hemi === "W") lng = t.hemi === "W" ? -Math.abs(t.value) : Math.abs(t.value);
  }
  // Fill remaining slots positionally from untagged tokens.
  if (lat === undefined && lng === undefined) {
    lat = tokens[0].value; lng = tokens[1].value;
  } else {
    for (const t of tokens) {
      if (t.hemi) continue;
      if (lat === undefined) lat = t.value;
      else if (lng === undefined) lng = t.value;
    }
  }
  if (lat === undefined || lng === undefined || !inRange(lat, lng)) return null;
  return { lat, lng, source: "raw" };
}

export function parseCoords(input: string): ParsedCoords | null {
  const s = input.trim();
  if (!s) return null;
  return parseUrl(s) ?? parseDms(s) ?? parseDecimal(s);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/parseCoords.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/parseCoords.ts tests/lib/parseCoords.test.ts
git commit -m "feat: add parseCoords for decimal/DMS/map-URL coordinate input"
```

---

## Task 2: Search-target classifier — `lib/searchTarget.ts`  [model: claude-haiku-4-5-20251001]

**Files:**
- Create: `lib/searchTarget.ts`
- Test: `tests/lib/searchTarget.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/searchTarget.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSearchTarget } from "@/lib/searchTarget";

describe("parseSearchTarget", () => {
  it("classifies a Mountain Project route URL", () => {
    expect(parseSearchTarget("https://www.mountainproject.com/route/105748662/the-nose"))
      .toEqual({ kind: "mp", id: "105748662" });
  });
  it("classifies a mangled MP URL (missing scheme slash)", () => {
    expect(parseSearchTarget("mountainproject.com/route/201226065/x"))
      .toEqual({ kind: "mp", id: "201226065" });
  });
  it("classifies a map URL as coords with source url", () => {
    expect(parseSearchTarget("https://www.google.com/maps/@37.734,-119.637,15z"))
      .toEqual({ kind: "coords", lat: 37.734, lng: -119.637, source: "url" });
  });
  it("classifies raw decimal coords with source raw", () => {
    expect(parseSearchTarget("37.734, -119.637"))
      .toEqual({ kind: "coords", lat: 37.734, lng: -119.637, source: "raw" });
  });
  it("returns null for plain text", () => {
    expect(parseSearchTarget("the nose")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/searchTarget.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/searchTarget"`.

- [ ] **Step 3: Write the implementation**

Create `lib/searchTarget.ts`:

```ts
import { parseCoords } from "./parseCoords";

const MP_URL_RE = /mountainproject\.com\/route\/(\d+)/;

export type SearchTarget =
  | { kind: "mp"; id: string }
  | { kind: "coords"; lat: number; lng: number; source: "url" | "raw" }
  | null;

export function parseSearchTarget(input: string): SearchTarget {
  const mp = MP_URL_RE.exec(input);
  if (mp) return { kind: "mp", id: mp[1] };
  const coords = parseCoords(input);
  if (coords) return { kind: "coords", lat: coords.lat, lng: coords.lng, source: coords.source };
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/searchTarget.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/searchTarget.ts tests/lib/searchTarget.test.ts
git commit -m "feat: add parseSearchTarget to classify MP-URL vs coords vs none"
```

---

## Task 3: Saved-route union + `routeKey` — `lib/favorites.ts`, `lib/schema.ts`  [model: claude-sonnet-4-6]

**Files:**
- Modify: `lib/schema.ts`
- Modify: `lib/favorites.ts`
- Modify (update existing tests): `tests/lib/favorites.test.ts`

- [ ] **Step 1: Update the schema type**

In `lib/schema.ts`, replace:

```ts
export type SavedRouteJson = {
  id: number;
  name: string;
  area: string | null;
  grade: string | null;
};
```

with:

```ts
export type SavedMpRouteJson = {
  kind?: "mp";
  id: number;
  name: string;
  area: string | null;
  grade: string | null;
};
export type SavedGpsRouteJson = {
  kind: "gps";
  lat: number;
  lng: number;
  name: string;
};
export type SavedRouteJson = SavedMpRouteJson | SavedGpsRouteJson;
```

- [ ] **Step 2: Update the favorites tests to the new API (write the failing tests)**

In `tests/lib/favorites.test.ts`:

Replace the type-import + fixtures block at the top:

```ts
import { useFavorites, type SavedRoute } from "@/lib/favorites";

const r1: SavedRoute = { id: 1, name: "The Nose", area: "Yosemite", grade: "5.14" };
const r2: SavedRoute = { id: 2, name: "Astroman", area: "Yosemite", grade: "5.11c" };
```

with:

```ts
import { useFavorites, routeKey, type SavedRoute } from "@/lib/favorites";

const r1: SavedRoute = { id: 1, name: "The Nose", area: "Yosemite", grade: "5.14" };
const r2: SavedRoute = { id: 2, name: "Astroman", area: "Yosemite", grade: "5.11c" };
const gps1: SavedRoute = { kind: "gps", lat: 37.734, lng: -119.637, name: "Secret boulder" };
```

Replace the `isSaved` test:

```ts
  it("isSaved returns true for a saved route and false for others", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    expect(result.current.isSaved(1)).toBe(true);
    expect(result.current.isSaved(2)).toBe(false);
  });
```

with:

```ts
  it("isSaved returns true for a saved route and false for others", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    expect(result.current.isSaved(r1)).toBe(true);
    expect(result.current.isSaved(r2)).toBe(false);
  });
```

Replace the `remove` test:

```ts
  it("remove removes by id", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    act(() => { result.current.toggle(r2); });
    act(() => { result.current.remove(1); });
    expect(result.current.favorites).toEqual([r2]);
  });
```

with:

```ts
  it("remove removes by route key", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    act(() => { result.current.toggle(r2); });
    act(() => { result.current.remove(r1); });
    expect(result.current.favorites).toEqual([r2]);
  });

  it("routeKey distinguishes MP and GPS routes", () => {
    expect(routeKey(r1)).toBe("mp:1");
    expect(routeKey(gps1)).toBe("gps:37.7340,-119.6370");
  });

  it("treats a kind-less stored entry as an MP route (backward compat)", () => {
    expect(routeKey({ id: 7, name: "x", area: null, grade: null })).toBe("mp:7");
  });

  it("saves and dedups a GPS route by coordinates", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(gps1); });
    expect(result.current.favorites).toEqual([gps1]);
    expect(result.current.isSaved(gps1)).toBe(true);
    // toggling the same coords (different name) removes it
    act(() => { result.current.toggle({ kind: "gps", lat: 37.734, lng: -119.637, name: "" }); });
    expect(result.current.favorites).toEqual([]);
  });

  it("keeps MP and GPS routes side by side", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    act(() => { result.current.toggle(gps1); });
    expect(result.current.favorites).toEqual([gps1, r1]);
    act(() => { result.current.remove(r1); });
    expect(result.current.favorites).toEqual([gps1]);
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/lib/favorites.test.ts`
Expected: FAIL — `routeKey` is not exported; `isSaved(r1)` type/behavior mismatch.

- [ ] **Step 4: Update `lib/favorites.ts`**

(a) Replace the import block and `SavedRoute` type at the top:

```ts

import { useCallback, useEffect, useRef, useState } from "react";

const FAV_KEY = "cw_favorites";
const LIST_ID_KEY = "cw_list_id";
const MAX = 50;

export type SavedRoute = {
  id: number;
  name: string;
  area: string | null;
  grade: string | null;
};
```

with:

```ts

import { useCallback, useEffect, useRef, useState } from "react";
import { coordsPath } from "./parseCoords";

const FAV_KEY = "cw_favorites";
const LIST_ID_KEY = "cw_list_id";
const MAX = 50;

export type SavedMpRoute = {
  kind?: "mp";
  id: number;
  name: string;
  area: string | null;
  grade: string | null;
};
export type SavedGpsRoute = {
  kind: "gps";
  lat: number;
  lng: number;
  name: string;
};
export type SavedRoute = SavedMpRoute | SavedGpsRoute;

/** Stable identity used for dedup, removal, and React keys. */
export function routeKey(r: SavedRoute): string {
  return r.kind === "gps" ? `gps:${coordsPath(r.lat, r.lng)}` : `mp:${r.id}`;
}
```

(b) Replace `isSaved`:

```ts
  const isSaved = useCallback(
    (id: number) => favorites.some((r) => r.id === id),
    [favorites],
  );
```

with:

```ts
  const isSaved = useCallback(
    (route: SavedRoute) => {
      const key = routeKey(route);
      return favorites.some((r) => routeKey(r) === key);
    },
    [favorites],
  );
```

(c) Replace `toggle`:

```ts
  const toggle = useCallback((route: SavedRoute) => {
    setFavorites((prev) => {
      const exists = prev.some((r) => r.id === route.id);
      const next = exists
        ? prev.filter((r) => r.id !== route.id)
        : [route, ...prev].slice(0, MAX);
      writeAndSync(next);
      return next;
    });
  }, [writeAndSync]);
```

with:

```ts
  const toggle = useCallback((route: SavedRoute) => {
    setFavorites((prev) => {
      const key = routeKey(route);
      const exists = prev.some((r) => routeKey(r) === key);
      const next = exists
        ? prev.filter((r) => routeKey(r) !== key)
        : [route, ...prev].slice(0, MAX);
      writeAndSync(next);
      return next;
    });
  }, [writeAndSync]);
```

(d) Replace `remove`:

```ts
  const remove = useCallback((id: number) => {
    setFavorites((prev) => {
      const next = prev.filter((r) => r.id !== id);
      writeAndSync(next);
      return next;
    });
  }, [writeAndSync]);
```

with:

```ts
  const remove = useCallback((route: SavedRoute) => {
    setFavorites((prev) => {
      const key = routeKey(route);
      const next = prev.filter((r) => routeKey(r) !== key);
      writeAndSync(next);
      return next;
    });
  }, [writeAndSync]);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/lib/favorites.test.ts`
Expected: PASS (all, including the cap test which toggles 55 MP routes with distinct ids).

- [ ] **Step 6: Commit**

```bash
git add lib/favorites.ts lib/schema.ts tests/lib/favorites.test.ts
git commit -m "feat: make SavedRoute a discriminated MP|GPS union keyed by routeKey"
```

---

## Task 4: Validate GPS shape in shared lists — `lib/list-validation.ts`  [model: claude-haiku-4-5-20251001]

**Files:**
- Modify: `lib/list-validation.ts`
- Modify (add tests): `tests/lib/list-validation.test.ts`

- [ ] **Step 1: Add the failing GPS tests**

Append inside the `describe("validateRoutesBody", ...)` block in `tests/lib/list-validation.test.ts` (before its closing `});`):

```ts
  const gps = { kind: "gps", lat: 37.734, lng: -119.637, name: "Secret boulder" };

  it("accepts a valid GPS route", () => {
    expect(validateRoutesBody({ routes: [gps] })).toEqual([gps]);
  });

  it("accepts a mixed MP + GPS array", () => {
    expect(validateRoutesBody({ routes: [good, gps] })).toEqual([good, gps]);
  });

  it("rejects a GPS route with non-number lat", () => {
    expect(validateRoutesBody({ routes: [{ ...gps, lat: "37" }] })).toBeNull();
  });

  it("rejects a GPS route with out-of-range lng", () => {
    expect(validateRoutesBody({ routes: [{ ...gps, lng: 181 }] })).toBeNull();
  });

  it("rejects a GPS route with non-string name", () => {
    expect(validateRoutesBody({ routes: [{ ...gps, name: 5 }] })).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/lib/list-validation.test.ts`
Expected: FAIL on the GPS cases (current code requires numeric `id`).

- [ ] **Step 3: Update `lib/list-validation.ts`**

Replace the entire file with:

```ts
import type { SavedRouteJson } from "./schema";

const MAX_ROUTES = 50;
const LAT_MIN = -90, LAT_MAX = 90, LNG_MIN = -180, LNG_MAX = 180;

export function validateRoutesBody(body: unknown): SavedRouteJson[] | null {
  if (!body || typeof body !== "object") return null;
  const routes = (body as { routes?: unknown }).routes;
  if (!Array.isArray(routes)) return null;
  if (routes.length > MAX_ROUTES) return null;

  const out: SavedRouteJson[] = [];
  for (const r of routes) {
    if (!r || typeof r !== "object") return null;
    const rec = r as Record<string, unknown>;

    if (rec.kind === "gps") {
      if (typeof rec.lat !== "number" || !Number.isFinite(rec.lat)) return null;
      if (typeof rec.lng !== "number" || !Number.isFinite(rec.lng)) return null;
      if (rec.lat < LAT_MIN || rec.lat > LAT_MAX) return null;
      if (rec.lng < LNG_MIN || rec.lng > LNG_MAX) return null;
      if (typeof rec.name !== "string") return null;
      out.push({ kind: "gps", lat: rec.lat, lng: rec.lng, name: rec.name });
    } else {
      if (typeof rec.id !== "number") return null;
      if (typeof rec.name !== "string") return null;
      if (rec.area !== null && typeof rec.area !== "string") return null;
      if (rec.grade !== null && typeof rec.grade !== "string") return null;
      out.push({
        id: rec.id,
        name: rec.name,
        area: rec.area as string | null,
        grade: rec.grade as string | null,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/list-validation.test.ts`
Expected: PASS (existing MP cases still pass — the MP branch pushes objects without a `kind` field, matching the existing fixtures).

- [ ] **Step 5: Commit**

```bash
git add lib/list-validation.ts tests/lib/list-validation.test.ts
git commit -m "feat: accept GPS saved-route shape in shared-list validation"
```

---

## Task 5: GPS variant of the Save button — `components/SaveButton.tsx`  [model: claude-sonnet-4-6]

**Files:**
- Modify: `components/SaveButton.tsx`
- Create: `tests/components/SaveButton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/SaveButton.test.tsx`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaveButton } from "@/components/SaveButton";
import type { SavedRoute } from "@/lib/favorites";

beforeEach(() => localStorage.clear());

const mpRoute: SavedRoute = { id: 1, name: "The Nose", area: "Yosemite", grade: "5.9" };

describe("SaveButton — MP route", () => {
  it("saves and removes an MP route", async () => {
    render(<SaveButton route={mpRoute} />);
    await userEvent.click(screen.getByRole("button", { name: /save route/i }));
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual([mpRoute]);
    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual([]);
  });
});

describe("SaveButton — GPS location", () => {
  it("prompts for a name and saves a GPS route", async () => {
    render(<SaveButton gps={{ lat: 37.734, lng: -119.637 }} />);
    await userEvent.click(screen.getByRole("button", { name: /save location/i }));
    await userEvent.type(screen.getByLabelText(/location name/i), "Secret boulder");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual([
      { kind: "gps", lat: 37.734, lng: -119.637, name: "Secret boulder" },
    ]);
  });

  it("defaults the name to the formatted coordinates when blank", async () => {
    render(<SaveButton gps={{ lat: 37.734, lng: -119.637 }} />);
    await userEvent.click(screen.getByRole("button", { name: /save location/i }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual([
      { kind: "gps", lat: 37.734, lng: -119.637, name: "37.7340, -119.6370" },
    ]);
  });

  it("shows saved state and removes when already saved", async () => {
    localStorage.setItem(
      "cw_favorites",
      JSON.stringify([{ kind: "gps", lat: 37.734, lng: -119.637, name: "Secret boulder" }]),
    );
    render(<SaveButton gps={{ lat: 37.734, lng: -119.637 }} />);
    expect(screen.getByText(/saved ✓/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/SaveButton.test.tsx`
Expected: FAIL — `gps` prop not supported; "Save location" not found.

- [ ] **Step 3: Rewrite `components/SaveButton.tsx`**

Replace the entire file with:

```tsx
"use client";

import { useState } from "react";
import { useFavorites, type SavedRoute } from "@/lib/favorites";
import { formatCoords } from "@/lib/parseCoords";

type SaveButtonProps =
  | { route: SavedRoute }
  | { gps: { lat: number; lng: number } };

export function SaveButton(props: SaveButtonProps) {
  if ("gps" in props) {
    return <GpsSaveButton lat={props.gps.lat} lng={props.gps.lng} />;
  }
  return <MpSaveButton route={props.route} />;
}

function MpSaveButton({ route }: { route: SavedRoute }) {
  const { isSaved, toggle } = useFavorites();
  const saved = isSaved(route);

  return (
    <button className={`save-btn${saved ? " save-btn--saved" : ""}`} onClick={() => toggle(route)}>
      <span className="save-btn__label">{saved ? "Saved ✓" : "Save route"}</span>
      {saved && <span className="save-btn__remove-label">× Remove</span>}
    </button>
  );
}

function GpsSaveButton({ lat, lng }: { lat: number; lng: number }) {
  const { isSaved, toggle } = useFavorites();
  const probe: SavedRoute = { kind: "gps", lat, lng, name: "" };
  const saved = isSaved(probe);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  if (saved) {
    return (
      <button className="save-btn save-btn--saved" onClick={() => toggle(probe)}>
        <span className="save-btn__label">Saved ✓</span>
        <span className="save-btn__remove-label">× Remove</span>
      </button>
    );
  }

  if (!editing) {
    return (
      <button className="save-btn" onClick={() => setEditing(true)}>
        <span className="save-btn__label">Save location</span>
      </button>
    );
  }

  function commit() {
    const finalName = name.trim() || formatCoords(lat, lng);
    toggle({ kind: "gps", lat, lng, name: finalName });
    setEditing(false);
  }

  return (
    <form
      className="save-gps-form"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <input
        type="text"
        aria-label="Location name"
        placeholder={formatCoords(lat, lng)}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <button type="submit" className="save-btn">Save</button>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/SaveButton.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/SaveButton.tsx tests/components/SaveButton.test.tsx
git commit -m "feat: add GPS-location variant to SaveButton with name prompt"
```

---

## Task 6: GPS weather page — `app/at/[coords]/`  [model: claude-sonnet-4-6]

**Files:**
- Create: `app/at/[coords]/page.tsx`
- Create: `app/at/[coords]/loading.tsx`
- Create: `app/at/[coords]/not-found.tsx`
- Create: `tests/components/GpsWeatherPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/GpsWeatherPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { WeatherResponse } from "@/lib/weather";

const notFoundMock = vi.hoisted(() => vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

const fetchWeatherMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/weather", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/weather")>()),
  fetchWeather: fetchWeatherMock,
}));

const { default: GpsWeatherPage } = await import("@/app/at/[coords]/page");

const fixture: WeatherResponse = {
  daily: [{ date: "2026-05-29", tempMax: 20, tempMin: 8, precip: 0 }],
  hourly: [{ datetime: "2026-05-29T12:00", temp: 18, precip: 0, windSpeed: 3, windGust: 5 }],
};

beforeEach(() => {
  notFoundMock.mockClear();
  fetchWeatherMock.mockReset();
  localStorage.clear();
});

describe("GpsWeatherPage", () => {
  it("renders the formatted coordinates and weather for valid coords", async () => {
    fetchWeatherMock.mockResolvedValue(fixture);
    render(await GpsWeatherPage({ params: Promise.resolve({ coords: "37.7340,-119.6370" }) }));
    expect(screen.getByRole("heading", { name: "37.7340, -119.6370" })).toBeInTheDocument();
    expect(fetchWeatherMock).toHaveBeenCalledWith(37.734, -119.637);
    // WeatherView renders the day-window picker
    expect(screen.getByRole("button", { name: "7d" })).toBeInTheDocument();
  });

  it("calls notFound for unparseable coords", async () => {
    await expect(
      GpsWeatherPage({ params: Promise.resolve({ coords: "not-coords" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("shows the unavailable message when fetchWeather fails", async () => {
    fetchWeatherMock.mockRejectedValue(new Error("upstream"));
    render(await GpsWeatherPage({ params: Promise.resolve({ coords: "48.0,11.0" }) }));
    expect(screen.getByText(/weather unavailable/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/GpsWeatherPage.test.tsx`
Expected: FAIL — `Failed to resolve import "@/app/at/[coords]/page"`.

- [ ] **Step 3: Create the page and siblings**

Create `app/at/[coords]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { WeatherView } from "@/components/WeatherView";
import { SaveButton } from "@/components/SaveButton";
import { FetchedAt } from "@/components/FetchedAt";
import { fetchWeather, type WeatherResponse } from "@/lib/weather";
import { parseCoords, formatCoords } from "@/lib/parseCoords";

export const revalidate = 600;

export default async function GpsWeatherPage({
  params,
}: {
  params: Promise<{ coords: string }>;
}) {
  const { coords } = await params;
  const parsed = parseCoords(decodeURIComponent(coords));
  if (!parsed) notFound();

  const { lat, lng } = parsed;
  let weather: WeatherResponse | null = null;
  try {
    weather = await fetchWeather(lat, lng);
  } catch (err) {
    console.error(`fetchWeather failed for GPS (${lat},${lng}):`, err);
    weather = null;
  }

  const fetchedAt = new Date();

  return (
    <main className="route-page">
      <header className="route-header">
        <h1>{formatCoords(lat, lng)}</h1>
        <p className="route-meta">
          <span>GPS location</span>
        </p>
        <SaveButton gps={{ lat, lng }} />
        <p className="weather-fetched-at">
          Weather updated <FetchedAt iso={fetchedAt.toISOString()} />
        </p>
      </header>

      {weather ? (
        <WeatherView weather={weather} />
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

Create `app/at/[coords]/loading.tsx`:

```tsx
export default function Loading() {
  return (
    <main className="route-page">
      <p>Loading…</p>
    </main>
  );
}
```

Create `app/at/[coords]/not-found.tsx`:

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="route-page">
      <h1>Invalid coordinates</h1>
      <p>
        That doesn&apos;t look like a valid GPS location. Latitude must be between −90 and 90,
        longitude between −180 and 180.
      </p>
      <p><Link href="/">← Back to search</Link></p>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/GpsWeatherPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/at tests/components/GpsWeatherPage.test.tsx
git commit -m "feat: add /at/[coords] GPS weather page"
```

---

## Task 7: Render GPS entries in saved lists — `SavedRoutes.tsx`, `ConfirmJoin.tsx`  [model: claude-sonnet-4-6]

**Files:**
- Modify: `components/SavedRoutes.tsx`
- Modify: `app/list/[id]/ConfirmJoin.tsx`
- Modify (add tests): `tests/components/SavedRoutes.test.tsx`
- Modify (add tests): `tests/components/ConfirmJoin.test.tsx`

- [ ] **Step 1: Add failing tests**

Append to `tests/components/SavedRoutes.test.tsx` inside `describe("SavedRoutes", ...)` (before its closing `});`):

```ts
  it("renders a GPS favorite with coordinates and an /at link", () => {
    localStorage.setItem(
      "cw_favorites",
      JSON.stringify([{ kind: "gps", lat: 37.734, lng: -119.637, name: "Secret boulder" }]),
    );
    render(<SavedRoutes />);
    expect(screen.getByText("Secret boulder")).toBeInTheDocument();
    expect(screen.getByText("37.7340, -119.6370")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /secret boulder/i }))
      .toHaveAttribute("href", "/at/37.7340,-119.6370");
  });
```

Append to `tests/components/ConfirmJoin.test.tsx` inside `describe("ConfirmJoin", ...)` (before its closing `});`):

```ts
  it("renders a GPS route in the preview with its coordinates", () => {
    render(
      <ConfirmJoin
        listId={listId}
        routes={[{ kind: "gps", lat: 37.734, lng: -119.637, name: "Secret boulder" }]}
      />,
    );
    expect(screen.getByText("Secret boulder")).toBeInTheDocument();
    expect(screen.getByText(/37\.7340, -119\.6370/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/SavedRoutes.test.tsx tests/components/ConfirmJoin.test.tsx`
Expected: FAIL — GPS link href is `/route/undefined`; coordinates not rendered.

- [ ] **Step 3: Update `components/SavedRoutes.tsx`**

(a) Replace the import line:

```tsx
import { useFavorites } from "@/lib/favorites";
```

with:

```tsx
import { useFavorites, routeKey, type SavedRoute } from "@/lib/favorites";
import { formatCoords, coordsPath } from "@/lib/parseCoords";
```

(b) Replace the `<ul>…</ul>` favorites list:

```tsx
        <ul>
          {favorites.map((r) => (
            <li key={r.id} className="saved-card">
              <Link href={`/route/${r.id}`} className="saved-card-link">
                <span className="saved-card-name">{r.name}</span>
                {r.grade && <span className="saved-card-grade">{r.grade}</span>}
                {r.area && <span className="saved-card-area">{r.area}</span>}
              </Link>
              <button
                className="saved-card-remove"
                onClick={() => remove(r.id)}
                aria-label={`Remove ${r.name} from saved`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
```

with:

```tsx
        <ul>
          {favorites.map((r) => (
            <li key={routeKey(r)} className="saved-card">
              <Link href={savedHref(r)} className="saved-card-link">
                <span className="saved-card-name">{r.name}</span>
                {r.kind === "gps" ? (
                  <span className="saved-card-area">{formatCoords(r.lat, r.lng)}</span>
                ) : (
                  <>
                    {r.grade && <span className="saved-card-grade">{r.grade}</span>}
                    {r.area && <span className="saved-card-area">{r.area}</span>}
                  </>
                )}
              </Link>
              <button
                className="saved-card-remove"
                onClick={() => remove(r)}
                aria-label={`Remove ${r.name} from saved`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
```

(c) Add the `savedHref` helper just above the `export function SavedRoutes()` line:

```tsx
function savedHref(r: SavedRoute): string {
  return r.kind === "gps" ? `/at/${coordsPath(r.lat, r.lng)}` : `/route/${r.id}`;
}
```

- [ ] **Step 4: Update `app/list/[id]/ConfirmJoin.tsx`**

(a) Replace the import line:

```tsx
import { useFavorites, type SavedRoute } from "@/lib/favorites";
```

with:

```tsx
import { useFavorites, routeKey, type SavedRoute } from "@/lib/favorites";
import { formatCoords } from "@/lib/parseCoords";
```

(b) Replace the preview list:

```tsx
        {routes.slice(0, 5).map((r) => (
          <li key={r.id}>
            {r.name}
            {r.area && <span> · {r.area}</span>}
            {r.grade && <span> · {r.grade}</span>}
          </li>
        ))}
```

with:

```tsx
        {routes.slice(0, 5).map((r) => (
          <li key={routeKey(r)}>
            {r.name}
            {r.kind === "gps" ? (
              <span> · {formatCoords(r.lat, r.lng)}</span>
            ) : (
              <>
                {r.area && <span> · {r.area}</span>}
                {r.grade && <span> · {r.grade}</span>}
              </>
            )}
          </li>
        ))}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/components/SavedRoutes.test.tsx tests/components/ConfirmJoin.test.tsx`
Expected: PASS (existing MP-shape tests still pass — `r.kind` is `undefined` for those, taking the MP branch).

- [ ] **Step 6: Commit**

```bash
git add components/SavedRoutes.tsx app/list/[id]/ConfirmJoin.tsx tests/components/SavedRoutes.test.tsx tests/components/ConfirmJoin.test.tsx
git commit -m "feat: render GPS favorites with coords and /at links in lists"
```

---

## Task 8: Search box coordinate handling — `components/SearchBox.tsx`  [model: claude-sonnet-4-6]

**Files:**
- Modify: `components/SearchBox.tsx`
- Modify (add tests): `tests/components/SearchBox.test.tsx`

- [ ] **Step 1: Add failing tests**

Append to `tests/components/SearchBox.test.tsx` inside `describe("SearchBox", ...)` (before its closing `});`):

```ts
  it("shows a coords dropdown row for raw decimal coordinates (no navigation)", async () => {
    const user = userEvent.setup();
    render(<SearchBox />);
    await user.click(screen.getByRole("searchbox"));
    await user.paste("37.734, -119.637");
    const link = await screen.findByRole("link", { name: /Weather at 37\.7340, -119\.6370/i });
    expect(link).toHaveAttribute("href", "/at/37.7340,-119.6370");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("navigates directly when a map URL is pasted", async () => {
    const user = userEvent.setup();
    render(<SearchBox />);
    await user.click(screen.getByRole("searchbox"));
    await user.paste("https://www.google.com/maps/@37.734,-119.637,15z");
    expect(mockPush).toHaveBeenCalledWith("/at/37.7340,-119.6370");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/SearchBox.test.tsx`
Expected: FAIL — coords row not rendered; map URL not handled.

- [ ] **Step 3: Rewrite `components/SearchBox.tsx`**

Replace the entire file with:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { parseSearchTarget } from "@/lib/searchTarget";
import { formatCoords, coordsPath } from "@/lib/parseCoords";

type Result = { id: number; slug: string; name: string; areaPath: string | null; grade: string | null };

export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const target = parseSearchTarget(q);

    if (target?.kind === "mp") {
      setResults([]);
      setCoords(null);
      router.push(`/route/${target.id}`);
      return;
    }

    if (target?.kind === "coords") {
      setResults([]);
      if (target.source === "url") {
        setCoords(null);
        router.push(`/at/${coordsPath(target.lat, target.lng)}`);
      } else {
        setCoords({ lat: target.lat, lng: target.lng });
      }
      return;
    }

    setCoords(null);
    if (q.trim().length === 0) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const j = await res.json();
        setResults(j.results);
      } catch {
        // Silent; offline is OK in dropdown
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, router]);

  const showDropdown = coords !== null || results.length > 0;

  return (
    <div className="searchbox">
      <input
        type="search"
        placeholder="Search a route or paste coordinates…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search routes"
      />
      {showDropdown && (
        <ul role="listbox" className="searchbox-results">
          {coords && (
            <li key="coords">
              <Link href={`/at/${coordsPath(coords.lat, coords.lng)}`}>
                <span className="result-name">📍 Weather at {formatCoords(coords.lat, coords.lng)}</span>
              </Link>
            </li>
          )}
          {results.map((r) => (
            <li key={r.id}>
              <Link href={`/route/${r.id}`}>
                <span className="result-name">{r.name}</span>
                {(r.grade || r.areaPath) && (
                  <span className="result-meta">
                    {[r.grade, r.areaPath].filter(Boolean).join(" · ")}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/SearchBox.test.tsx`
Expected: PASS (all, including the three pre-existing MP/DB-search/plain-text tests).

- [ ] **Step 5: Commit**

```bash
git add components/SearchBox.tsx tests/components/SearchBox.test.tsx
git commit -m "feat: handle coordinates in search box (map-URL redirect, raw coords row)"
```

---

## Task 9: Generalize the home-page deep link — `app/page.tsx`  [model: claude-sonnet-4-6]

**Files:**
- Modify: `app/page.tsx`
- Modify (add tests): `tests/components/HomePage.test.tsx`

- [ ] **Step 1: Add failing tests**

Append to `tests/components/HomePage.test.tsx` inside `describe("HomePage ?mp= redirect", ...)` (before its closing `});`):

```ts
  it("redirects to /at/<coords> for raw coords in ?q=", async () => {
    await render(await HomePage({ searchParams: Promise.resolve({ q: "37.734, -119.637" }) }));
    expect(redirect).toHaveBeenCalledWith("/at/37.7340,-119.6370");
  });

  it("redirects to /route/:id for an MP URL in ?q=", async () => {
    await render(
      await HomePage({
        searchParams: Promise.resolve({ q: "https://www.mountainproject.com/route/105748662/the-nose" }),
      }),
    );
    expect(redirect).toHaveBeenCalledWith("/route/105748662");
  });

  it("does not redirect for unrecognized ?q= text", async () => {
    await render(await HomePage({ searchParams: Promise.resolve({ q: "the nose" }) }));
    expect(redirect).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/HomePage.test.tsx`
Expected: FAIL — `q` param is ignored (no redirect).

- [ ] **Step 3: Update `app/page.tsx`**

(a) Replace the imports + `MP_URL_RE` block:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchBox } from "@/components/SearchBox";
import { SavedRoutes } from "@/components/SavedRoutes";
import { searchRoutes } from "@/lib/search";

const MP_URL_RE = /mountainproject\.com\/route\/(\d+)/;
```

with:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchBox } from "@/components/SearchBox";
import { SavedRoutes } from "@/components/SavedRoutes";
import { searchRoutes } from "@/lib/search";
import { parseSearchTarget } from "@/lib/searchTarget";
import { coordsPath } from "@/lib/parseCoords";
```

(b) Replace the component signature + redirect logic:

```tsx
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ mp?: string }>;
}) {
  const { mp } = await searchParams;
  const match = mp ? MP_URL_RE.exec(mp) : null;
  if (match) redirect(`/route/${match[1]}`);
```

with:

```tsx
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; mp?: string }>;
}) {
  const { q, mp } = await searchParams;
  const input = q ?? mp;
  if (input) {
    const target = parseSearchTarget(input);
    if (target?.kind === "mp") redirect(`/route/${target.id}`);
    if (target?.kind === "coords") redirect(`/at/${coordsPath(target.lat, target.lng)}`);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/HomePage.test.tsx`
Expected: PASS (existing `?mp=` tests still pass — `mp` is used when `q` is absent).

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx tests/components/HomePage.test.tsx
git commit -m "feat: generalize home deep link to ?q= (URL/coords), keep ?mp= alias"
```

---

## Task 10: Documentation — `CLAUDE.md`  [model: claude-haiku-4-5-20251001]

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the architecture / search-flow section**

In the "**Search flow:**" section of `CLAUDE.md`, after the paragraph that begins "Pasting a Mountain Project URL into the search box…", add this paragraph:

```markdown
Entering GPS coordinates in the search box (decimal degrees like `37.734, -119.637`, DMS, or a pasted Google/Apple Maps URL) navigates to `/at/<lat>,<lng>` — a coordinate-only weather page with no MP backing. Raw typed coordinates surface as a "📍 Weather at …" dropdown row; pasted map URLs (and MP URLs) redirect immediately. `lib/parseCoords.ts` parses the formats; `lib/searchTarget.ts` (`parseSearchTarget`) classifies input as MP-route / coords / none and is shared by `SearchBox` and the home-page deep link. The home page accepts `?q=<url-or-coords>` (general) and keeps `?mp=<MP url>` as a legacy alias.
```

- [ ] **Step 2: Add the new key files**

In the "## Key files" list, add these bullets:

```markdown
- `lib/parseCoords.ts` — `parseCoords` (decimal/DMS/map-URL → `{lat,lng,source}`), `formatCoords` (display), `coordsPath` (URL/key)
- `lib/searchTarget.ts` — `parseSearchTarget`: MP-URL regex → `parseCoords`; single source of truth for search-box + `?q=` routing
- `app/at/[coords]/page.tsx` — coordinate-only weather page; calls `fetchWeather(lat,lng)` directly (no DB/scrape), renders `WeatherView`
```

- [ ] **Step 3: Document the saved-route union**

In the "**Shared lists (favorites sync):**" section, append this paragraph after the existing description of `validateRoutesBody`:

```markdown
`SavedRoute` (and the shared-list `SavedRouteJson`) is a discriminated union: MP routes are `{ kind?: "mp", id, name, area, grade }`; GPS locations are `{ kind: "gps", lat, lng, name }`. `routeKey(r)` (`mp:<id>` / `gps:<lat,lng>`) is the identity used for dedup, removal, and React keys — `isSaved`/`toggle`/`remove` all key on it. Entries with no `kind` are treated as MP (backward compatible). `validateRoutesBody` accepts either shape (GPS branch range-checks lat/lng).
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document arbitrary GPS search, /at page, and saved-route union"
```

---

## Final verification

- [ ] **Run the full test suite.** Requires the local Postgres test DB (some unrelated suites are DB-backed):

```bash
docker compose up -d
npm test
```
Expected: all suites pass, including the pre-existing DB-backed tests and every test added/modified in this plan.

- [ ] **Manual smoke (optional).** `npm run dev`, then:
  - Type `37.734, -119.637` → dropdown shows "📍 Weather at 37.7340, -119.6370"; clicking opens `/at/37.7340,-119.6370` with charts.
  - Paste a Google Maps URL → redirects straight to the `/at` page.
  - On an `/at` page, click "Save location", enter a name, confirm it appears under Saved routes on the home page and links back to the `/at` page.
  - Visit `/?q=37.734,-119.637` → redirects to the `/at` page.

---

## Self-Review (completed by plan author)

**Spec coverage:** parseCoords (§1)→T1; searchTarget (§2)→T2; `/at` page (§3)→T6; saved-route union/routeKey (§4)→T3; list-validation GPS (§4)→T4; SaveButton GPS (§4)→T5; SavedRoutes+ConfirmJoin (§4)→T7; SearchBox (§5)→T8; `?q=`/`?mp=` (§6)→T9; tests (§Testing)→each task's tests; docs→T10. All spec sections mapped.

**Type consistency:** `isSaved(route)`/`remove(route)`/`toggle(route)` all take `SavedRoute` and are used that way in SaveButton (T5), SavedRoutes (T7), and the favorites tests (T3). `routeKey` uses `coordsPath`; display uses `formatCoords`; `/at` links + keys use `coordsPath` (no space) consistently across T3/T6/T7/T8/T9. `parseSearchTarget` return shape is consumed identically in SearchBox (T8) and HomePage (T9).

**Placeholders:** none — every code/edit step contains complete code.
