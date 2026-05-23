# MP URL Query Parameter — Design Spec

**Date:** 2026-05-23  
**Status:** Approved

## Summary

Allow users to navigate directly to a route's weather page by passing a Mountain Project URL as a `?mp=` query parameter on the home page, bypassing the search UI entirely.

**Example:**
```
https://cragweather.com/?mp=https://www.mountainproject.com/route/105748662/the-nose
```
→ server redirects to `/route/105748662`

## Motivation

Currently users must visit the home page, paste the MP URL into the search box, and wait for the redirect. A `?mp=` param enables direct linking, bookmarks, and scripted access.

## Architecture

**One file changed:** `app/page.tsx`

`HomePage` becomes an async server component that accepts `searchParams`. Before rendering, it:

1. Reads `searchParams.mp`.
2. Matches against `/mountainproject\.com\/route\/(\d+)/`.
3. If matched, calls Next.js `redirect(`/route/${id}`)` — a server-side HTTP redirect.
4. If not matched or absent, renders the home page unchanged.

## Error Handling

If `mp` is present but does not match the MP URL pattern (malformed or wrong domain), the home page renders normally. No error state or message is shown — the user sees the search box as usual.

## Scope

- No new files.
- No API changes.
- No UI changes.
- The regex is the same pattern already used in `SearchBox.tsx`.
