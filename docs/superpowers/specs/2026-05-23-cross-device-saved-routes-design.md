# Cross-device saved routes — design

## Problem

Today, saved routes live in `localStorage` (`cw_favorites`), so a list saved on a laptop is invisible on a phone. The user wants to see the same list of saved climbing routes across devices, with the lightest possible solution — no accounts, no login.

## Solution overview

Introduce an opt-in "Sync" feature. When the user taps a button, the current local favorites are uploaded to the server, the server returns a UUID, and the user is shown a URL (plus QR code) they can open on any other device to link that device to the same list. Linked devices read and write through the server.

Whoever holds the URL has full edit rights — there is no "creator" concept, no auth.

## Data model

One new Postgres table:

```ts
shared_lists {
  id          uuid primary key default gen_random_uuid()
  routes      jsonb not null            // SavedRoute[] — same shape as localStorage
  created_at  timestamptz not null default now()
  updated_at  timestamptz not null default now()
}
```

`routes` mirrors the existing `SavedRoute[]` shape from [lib/favorites.ts](lib/favorites.ts): `{ id: number; name: string; area: string | null; grade: string | null }[]`. No foreign key into `routes` — when MP rescrapes a route's name/area, the cached copy in the synced list is stale until the user re-saves it (same trade-off `localStorage` already has). No expiration in v1.

## API

Three endpoints under `app/api/list/`:

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/api/list` | `{ routes: SavedRoute[] }` | `{ id: uuid }` |
| `GET` | `/api/list/[id]` | — | `{ routes: SavedRoute[] }` or `404` |
| `PUT` | `/api/list/[id]` | `{ routes: SavedRoute[] }` | `{ ok: true }` |

- `POST` creates a new row; called once the first time a device is synced.
- `GET` fetches the list; called on app load when a device is linked, and on `/list/[id]` page visit.
- `PUT` replaces `routes` entirely (last-write-wins) and bumps `updated_at`. Called every time the user adds/removes a favorite on a linked device.

**Validation** (hand-written, no zod dependency):
- `routes` must be an array.
- Length ≤ 50 (same cap as `MAX` in `lib/favorites.ts`).
- Each item must have `id: number` and `name: string`. `area` and `grade` may be `string | null`.
- Reject malformed bodies with HTTP 400.

No auth, no rate limiting in v1.

## Client sync logic

A new `localStorage` key, `cw_list_id` (the UUID string), is the single source of truth for "this device is linked."

### `useFavorites` changes

- **On mount:** if `cw_list_id` exists, fire a GET in the background; replace local state with the server response when it arrives. The local cache renders instantly; the server takes precedence on resolution.
- **On `toggle` / `remove`:** write to `localStorage` exactly as today. If `cw_list_id` exists, also fire a PUT with the full updated list. Fire-and-forget — no debounce (saves are user-paced).
- **PUT failure:** the local write still succeeded; the next successful PUT will catch the server up. No retry queue in v1.
- **GET / local-write race:** if the user toggles a route during the brief window between mount and the GET resolving, the GET response could overwrite the just-toggled local state. The user's PUT will still reach the server (eventually consistent), but for a tab refresh of < ~500 ms this is a known limitation in v1. Mitigation deferred.

### New flows

1. **Sync this device.** A button below the Saved routes section on the home page. When unlinked, tapping it POSTs the current local favorites, stores the returned UUID in `cw_list_id`, and opens a modal showing the URL and QR code. When already linked, tapping the same button (now showing "Synced — show QR") just reopens the modal with the existing URL and an "Unlink this device" action.

2. **Visit `/list/<uuid>`** (from QR scan or pasted URL). A server component fetches the list and renders a confirmation page: *"This shared list has N routes. [Link this device] [Cancel]"*. Linking writes `cw_list_id`, replaces local favorites with the server's list, and redirects to home. Cancel just navigates away. **Read-only viewing is not offered in v1** — the model stays simple: either linked or not.

### Edge cases

- Device already linked to a different UUID and visits a new `/list/<id>` → confirmation reads "you're currently synced to a different list — switch?"
- Device has local favorites and visits `/list/<id>` for the first time → confirmation explicitly warns "your N local routes will be replaced." No merge in v1.
- "Unlink" removes `cw_list_id` locally but leaves the server row intact (other linked devices keep working).

## UI changes

- [components/SavedRoutes.tsx](components/SavedRoutes.tsx): show `area` and `grade` alongside the route name. (The data is already in `SavedRoute`; only the render changes.)
- New "Sync to another device" button below the Saved routes section. Opens the sync modal.
- New sync modal component containing the URL (with copy-to-clipboard), the QR code, and (when already linked) an "Unlink this device" button.
- A small "Synced" badge next to the Saved routes heading when `cw_list_id` is set.
- New page [app/list/[id]/page.tsx](app/list/[id]/page.tsx) for the confirmation flow.

## Dependencies

- `qrcode.react` — SVG QR rendering, ~3 KB, no peer dependencies. Imported only inside the sync modal so it does not affect bundles on other pages.

## Migration

- `npm run db:generate` to create the Drizzle migration for `shared_lists`.
- `npm run db:migrate` for the local dev DB.
- `npm run db:migrate:test` for the test DB.
- Production picks up the migration through the existing Drizzle migration pipeline.

## Testing

- **`tests/api/list.test.ts`**: POST creates a row; GET returns it; PUT replaces it; 404 on unknown UUID; 400 on malformed body; 400 on > 50 routes.
- **`tests/lib/favorites.test.ts`**: with no `cw_list_id`, `useFavorites` behaves exactly as today; with `cw_list_id` set, mount triggers a GET and replaces local state; `toggle` triggers a PUT; PUT failure does not break the local write.
- Use the existing `crag_test` DB + `truncateAll()` pattern. No new fixtures needed.

## Non-goals (v1)

- No accounts, login, or per-user identity.
- No read-only sharing — viewing a list URL is a prompt to link, not a passive view.
- No conflict resolution beyond last-write-wins.
- No expiration or garbage collection of unused lists.
- No rate limiting or abuse prevention beyond the 50-route cap.
- No real-time push: linked devices see updates on next page load / hook mount, not via websockets/polling.
- No merge between local and shared favorites when first linking — the shared list always wins.
