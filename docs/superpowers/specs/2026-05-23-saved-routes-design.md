# Saved Routes Feature — Design Spec

**Date:** 2026-05-23  
**Status:** Approved

## Overview

Users can save climbing routes to a personal collection stored in `localStorage`. Saved routes appear on the homepage above Popular routes. Users can add/remove routes from the route page and remove them directly from the homepage.

## Data Model

Stored under the `localStorage` key `cw_favorites` as a JSON array, newest-first:

```ts
type SavedRoute = {
  id: number;
  name: string;
  area: string | null;
  grade: string | null;
};
```

No server-side storage. No extra fetches on the homepage — all display data is embedded in the stored object. Soft cap of 50 entries (each ~100 bytes; well within localStorage quota).

## Architecture

Three new files:

| File | Type | Purpose |
|------|------|---------|
| `lib/favorites.ts` | Client hook | Owns all localStorage read/write logic |
| `components/SaveButton.tsx` | Client component | Save/unsave toggle on the route page |
| `components/SavedRoutes.tsx` | Client component | Saved routes section on the homepage |

Both components are client islands dropped into server components (`app/route/[id]/page.tsx` and `app/page.tsx`). No changes to server-side data fetching.

## `lib/favorites.ts`

Exports `useFavorites()`:

```ts
function useFavorites(): {
  favorites: SavedRoute[];
  isSaved: (id: number) => boolean;
  toggle: (route: SavedRoute) => void;  // add if absent, remove if present
  remove: (id: number) => void;
}
```

- State initialised from `localStorage` on mount via `useEffect` (avoids SSR hydration mismatch)
- Writes are synchronous `localStorage.setItem` after state update
- Newest-first insertion: new entries are prepended to the array
- No external dependencies

## Components

### `SaveButton`

- Added to `app/route/[id]/page.tsx` below the "View on Mountain Project" link
- Receives `route: SavedRoute` as a prop (data already available from server fetch)
- Calls `useFavorites().toggle(route)` on click
- Label: "Save route" when unsaved, "Saved ✓" when saved (clicking either toggles state)

### `SavedRoutes`

- Added to `app/page.tsx` above the Popular routes section
- Reads `useFavorites().favorites` on mount
- Renders nothing if the array is empty
- Otherwise renders a section with the same structure and CSS as Popular routes (`.home-popular`)
- Each card has a small "×" remove button (calls `remove(id)`) positioned top-right

## Styling

Additions to `app/globals.css`:

- `.saved-card` — `position: relative` wrapper for each favorite card
- `.saved-card-remove` — absolute top-right "×" button; muted color, hover accent red
- `.save-btn` — secondary-style button on the route page (border, rounded, inherits font)

All section structure reuses existing `.home-popular` classes.

## Error Handling

- `localStorage` unavailable (private browsing, quota exceeded): wrap reads/writes in `try/catch`; silently degrade to empty favorites list
- Malformed JSON in storage: catch parse error, reset key to `[]`

## Testing

- Unit tests for `useFavorites` hook using `vitest` + `@testing-library/react`
- Test cases: add, remove, toggle, persistence across remounts, malformed JSON recovery, SSR-safe initialisation (no localStorage access before mount)
- No new component tests required beyond what the hook tests cover; the components are thin wrappers
