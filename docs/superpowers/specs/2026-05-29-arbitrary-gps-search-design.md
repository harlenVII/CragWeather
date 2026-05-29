# Arbitrary GPS Coordinates in Search — Design Spec

**Date:** 2026-05-29
**Status:** Approved

## Summary

Let users look up a 14-day weather window for an arbitrary GPS location — a crag, boulder, or wall that has no Mountain Project (MP) route page — by entering coordinates into the search box (or via a deep link). A GPS location is a **first-class, saveable, shareable "route"**: it can be named, saved to favorites, and shared in lists alongside MP routes.

**Examples:**
```
search box:  37.734, -119.637           → dropdown "📍 Weather at …" row → /at/37.7340,-119.6370
search box:  https://maps.google.com/...@37.734,-119.637,15z   → auto-redirect → /at/37.7340,-119.6370
deep link:   /?q=37.734,-119.637         → server redirect → /at/37.7340,-119.6370
```

## Motivation

`fetchWeather(lat, lng)` is already completely decoupled from MP — it only needs coordinates. The entire weather/chart stack therefore already supports arbitrary points; the only missing pieces are (1) a way to enter coordinates, and (2) a page that renders weather for a point that isn't backed by an MP route id. Climbers frequently want a forecast for a spot that MP doesn't catalog.

## The core constraint

Today the saved-route system is keyed entirely on a **numeric MP `id`**: dedup (`isSaved(id)`), `remove(id)`, the React `key={r.id}`, the `/route/${id}` link, the shared-list jsonb, and `validateRoutesBody`'s `id: number` check. A GPS location has no MP id, cannot be scraped, and links to a different page. Because GPS points must coexist with MP routes in favorites and shared lists, the saved-route model itself must grow into a discriminated union. This is the spine of the feature.

## Architecture

### 1. Coordinate parsing — `lib/parseCoords.ts` (new, pure)

```ts
export type ParsedCoords = { lat: number; lng: number; source: "url" | "raw" };
export function parseCoords(input: string): ParsedCoords | null;
export function formatCoords(lat: number, lng: number): string; // "37.7340, -119.6370"
```

`parseCoords` tries each format in order and returns the first hit, validating `lat ∈ [-90, 90]` and `lng ∈ [-180, 180]` (returns `null` if out of range or unparseable):

1. **Decimal degrees pair** (`source: "raw"`) — `37.734, -119.637`, `37.734 -119.637`; optional `°`; optional trailing hemisphere letters `N/S/E/W` that set the sign.
2. **Map app URLs** (`source: "url"`) — extract coordinates from Google Maps (`@lat,lng,zoom`, `?q=lat,lng`, `!3dlat!4dlng`) and Apple Maps (`?ll=lat,lng`, `?q=lat,lng`, `&sll=`).
3. **Degrees-minutes-seconds (DMS)** (`source: "raw"`) — `37°44'02"N 119°38'13"W` and variants using `'` / `"` / spaces. Converts to decimal degrees and applies the hemisphere sign.

`formatCoords` rounds to 4 decimal places (~11 m). The formatted string is used for display **and** as the dedup key, so two saves of effectively the same point collapse to one favorite.

**Known limitation:** shortened map links (`maps.app.goo.gl/…`, `goo.gl/maps/…`) redirect server-side and cannot be resolved client-side without a network round-trip. They are out of scope and simply return `null`.

### 2. Search-target classification — `lib/searchTarget.ts` (new, pure)

Centralizes the MP-URL regex that is currently **duplicated** in `SearchBox.tsx:6` and `app/page.tsx:7`, so the search box and the home-page deep link cannot drift apart.

```ts
export type SearchTarget =
  | { kind: "mp"; id: string }
  | { kind: "coords"; lat: number; lng: number; source: "url" | "raw" }
  | null;
export function parseSearchTarget(input: string): SearchTarget;
```

Order: match `mountainproject\.com\/route\/(\d+)` first (robust to mangled URLs, since it scans for the substring); otherwise delegate to `parseCoords`; otherwise `null`. `SearchBox` and `app/page.tsx` both import this; `parseCoords` stays the lower-level pure coordinate parser (also used to decode the `/at/[coords]` path segment).

### 3. GPS weather page — `app/at/[coords]/page.tsx` (new)

- URL shape: `/at/37.7340,-119.6370` (comma and minus are path-safe).
- Server component: decodes the `coords` segment with `parseCoords`; invalid → `notFound()`.
- Calls `fetchWeather(lat, lng)` **directly** (server module — no API hop). The `/route/[id]` page only self-fetches its API because that endpoint drives the DB lookup + MP scrape; a GPS page needs neither. `export const revalidate = 600` matches the existing 10-minute weather cache.
- Renders `<WeatherView weather={…} />`, an `<h1>` of `formatCoords(lat, lng)`, and a GPS-variant `<SaveButton>`. The weather-failure path mirrors the existing "Weather unavailable. Please refresh." message.
- Sibling `loading.tsx` and `not-found.tsx` mirror the existing `/route/[id]` files.

### 4. Saved-route model (favorites, schema, validation, UI)

**`lib/favorites.ts` + `lib/schema.ts`** — `SavedRoute` / `SavedRouteJson` become a discriminated union:

```ts
type SavedMpRoute  = { kind?: "mp"; id: number; name: string; area: string | null; grade: string | null };
type SavedGpsRoute = { kind: "gps"; lat: number; lng: number; name: string };
type SavedRoute = SavedMpRoute | SavedGpsRoute;
```

- New `routeKey(r: SavedRoute): string` → `"mp:123"` or `"gps:37.7340,-119.6370"` (GPS uses `formatCoords`). **Backward compatible:** existing stored entries have no `kind` field and are treated as MP.
- `isSaved`, `toggle`, `remove` switch from numeric id to `routeKey`. `isSaved`/`remove` accept a `SavedRoute` (or its key) rather than a `number`.

**`lib/list-validation.ts`** — `validateRoutesBody` accepts either shape per entry:
- MP branch: existing checks (numeric `id`, string `name`, nullable `area`/`grade`), allowing absent `kind`.
- GPS branch: `kind === "gps"`, `lat`/`lng` finite numbers within range, `name` a string.
- The 50-route cap is unchanged.

**`components/SaveButton.tsx`** — gains a GPS variant. Because a GPS point's name isn't known until the user types it, the GPS variant is given the raw `lat`/`lng` (not a finished `SavedRoute`); the first save reveals a small inline text input for a label (placeholder = `formatCoords`; blank submit → coords string), then constructs the `SavedGpsRoute` and toggles it. Saved-state derived via `routeKey`. The existing MP usage (`<SaveButton route={…} />`) is unchanged.

**`components/SavedRoutes.tsx` + `app/list/[id]/ConfirmJoin.tsx`** — `key={routeKey(r)}`; link MP entries → `/route/${id}`, GPS entries → `/at/${formatCoords-as-path}`; render coordinates as the meta line for GPS entries; `remove` by key.

### 5. Search box — `components/SearchBox.tsx`

Replace the inline MP regex with `parseSearchTarget(q)` on each change:

| `parseSearchTarget` result | Behavior |
|---|---|
| `{ kind: "mp" }` | auto-redirect → `/route/{id}` *(existing behavior, now centralized)* |
| `{ kind: "coords", source: "url" }` | **auto-redirect → `/at/{lat},{lng}`** (deliberate URL paste) |
| `{ kind: "coords", source: "raw" }` | render synthetic **"📍 Weather at {formatCoords}"** dropdown row → `/at/{lat},{lng}` (avoids navigating mid-typed decimal) |
| `null` | existing debounced live DB search |

### 6. Home-page deep link — `app/page.tsx`

`HomePage` reads `searchParams.q` (new general param) and falls back to `searchParams.mp` (legacy alias, kept working for existing shared links). It runs `parseSearchTarget` on the value:

- `kind: "mp"` → `redirect('/route/{id}')`
- `kind: "coords"` → `redirect('/at/{lat},{lng}')`
- `null` / absent → render the home page unchanged (unrecognized values are ignored, no error state).

## Error Handling

- Invalid/out-of-range coordinates in the `/at/[coords]` path → `notFound()`.
- `fetchWeather` failure on the GPS page → "Weather unavailable. Please refresh." (mirrors the route page).
- Unparseable search-box input → no synthetic row; falls through to DB search.
- Unrecognized `?q=` / `?mp=` value → home renders normally.
- Shortened map URLs → `parseCoords` returns `null`; in the search box this means no redirect/row (falls to DB search, which returns nothing useful — acceptable).

## Testing

- `tests/lib/parseCoords.test.ts` — all three formats, hemisphere signs, whitespace/`°`/`'`/`"` variants, Google & Apple URL shapes, out-of-range rejection, garbage → `null`, `source` discriminator, `formatCoords` rounding.
- `tests/lib/searchTarget.test.ts` — MP URL (incl. mangled) → `mp`; map URL → `coords`/`url`; raw coords → `coords`/`raw`; plain text → `null`.
- `tests/lib/favorites` (or a focused `routeKey` unit) — MP vs GPS dedup, backward-compat for `kind`-less entries, mixed list `toggle`/`remove` by key.
- `tests/lib/list-validation.test.ts` — GPS shape accepted, malformed GPS rejected, legacy MP shape still valid, mixed array.
- `tests/components/SearchBox.test.tsx` — raw coords → synthetic row with correct href; map URL → router push; MP URL → router push.
- A render test for `app/at/[coords]` — valid coords render charts; invalid → not-found (weather mocked via existing MSW handlers).

## Scope

**New files:** `lib/parseCoords.ts`, `lib/searchTarget.ts`, `app/at/[coords]/page.tsx`, `app/at/[coords]/loading.tsx`, `app/at/[coords]/not-found.tsx`, plus the corresponding test files.

**Modified files:** `lib/favorites.ts`, `lib/schema.ts`, `lib/list-validation.ts`, `components/SaveButton.tsx`, `components/SavedRoutes.tsx`, `components/SearchBox.tsx`, `app/page.tsx`, `app/list/[id]/ConfirmJoin.tsx`.

**Docs:** update `CLAUDE.md` (document `/at/[coords]`, the `?q=` param + `?mp=` legacy alias, the saved-route union, and `lib/parseCoords.ts` / `lib/searchTarget.ts`).

**Out of scope:** reverse geocoding / place names, shortened map-link resolution, editing a saved GPS name after creation, DB persistence of GPS points (they live only in localStorage / shared-list jsonb), elevation or any non-weather data.
