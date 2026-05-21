# Design: Mountain Project URL Support in SearchBox

**Date:** 2026-05-20  
**Status:** Approved

## Summary

When a user pastes a Mountain Project route URL into the search box, CragWeather should navigate directly to that route's page instead of performing a fuzzy text search.

## Approach

Client-side URL detection in `SearchBox` — no new API endpoints, no new pages.

## Architecture

All changes are confined to `components/SearchBox.tsx`.

**Detection regex:**
```
/mountainproject\.com\/route\/(\d+)/
```

This matches:
- Full URLs: `https://www.mountainproject.com/route/105862922/the-nose`
- Paths: `/route/105862922/the-nose`
- Bare domain+path: `mountainproject.com/route/105862922`

**Data flow:**

1. User types or pastes into the search input → `onChange` fires, `setQ` updates state.
2. A `useEffect` on `q` runs the regex before any debounce logic.
3. If the regex matches, call `router.push('/route/{id}')` immediately and return — debounce and results state are never touched.
4. If no match, existing fuzzy-search behavior is unchanged.

**Dependencies added:**

- `useRouter` from `next/navigation` (already available in the project, just not used in `SearchBox` yet).

## UX Behavior

| Input | Result |
|-------|--------|
| `https://www.mountainproject.com/route/105862922/the-nose` | Navigate to `/route/105862922` |
| `mountainproject.com/route/105862922` | Navigate to `/route/105862922` |
| `The Nose` | Normal fuzzy search |
| `mountainproject.com/route/` (no ID yet) | Normal fuzzy search (regex requires `\d+`) |

## Error Handling

No extra error handling required. If the extracted ID doesn't exist in the database, the user lands on the existing `/route/[id]` not-found page, which already handles this case gracefully.

## Testing

- Existing SearchBox tests are unaffected.
- Add a unit test: given a full MP URL as input, verify the router is called with the correct `/route/{id}` path.
- Add a unit test: given a plain name query, verify normal fetch behavior is triggered (router not called).

## Files Changed

- `components/SearchBox.tsx` — add `useRouter`, add URL detection logic in the `useEffect` that watches `q`.
