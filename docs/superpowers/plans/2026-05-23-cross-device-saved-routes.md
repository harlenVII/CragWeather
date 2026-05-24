# Cross-device saved routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user sync their saved climbing routes across devices via a shareable URL/QR — no accounts, no login. Opt-in: existing `localStorage` users see no change until they tap "Sync."

**Architecture:** New `shared_lists` Postgres table (uuid PK + jsonb routes blob). Three REST endpoints under `/api/list` (POST/GET/PUT). `useFavorites` gains a "linked" mode driven by a new `cw_list_id` localStorage key — when set, mount fetches from the server and every toggle/remove writes through. A new `/list/[id]` confirmation page is the join target for QR/URL.

**Tech Stack:** Next.js 14 (app router), Drizzle ORM, Postgres (jsonb + uuid), React 18, vitest + MSW + Testing Library, qrcode.react.

**Spec:** [docs/superpowers/specs/2026-05-23-cross-device-saved-routes-design.md](docs/superpowers/specs/2026-05-23-cross-device-saved-routes-design.md)

---

## Decomposition / file map

**New files:**
- `app/api/list/route.ts` — POST handler (creates a list)
- `app/api/list/[id]/route.ts` — GET + PUT handlers
- `app/list/[id]/page.tsx` — server component, fetches list and renders client confirmation
- `app/list/[id]/ConfirmJoin.tsx` — client component that writes `cw_list_id` and replaces local favorites
- `components/SyncModal.tsx` — sync modal: create-or-show URL + QR + unlink
- `lib/list-validation.ts` — shared body validator for POST/PUT
- `tests/api/list.test.ts` — endpoint tests
- `tests/components/SyncModal.test.tsx` — modal tests
- `tests/components/ConfirmJoin.test.tsx` — join page client tests

**Modified files:**
- `lib/schema.ts` — add `sharedLists` table
- `lib/favorites.ts` — add linked mode (`listId`, `link`, `unlink`, `createSyncedList`)
- `tests/lib/favorites.test.ts` — add linked-mode tests
- `tests/helpers/test-db.ts` — include `shared_lists` in TRUNCATE
- `components/SavedRoutes.tsx` — render area/grade, sync button, synced badge
- `app/globals.css` — styles for modal, badge, area/grade lines
- `package.json` — add `qrcode.react`

---

## Task 1: Add `shared_lists` schema, migrate, extend test truncate

**Model:** claude-sonnet-4-6

**Files:**
- Modify: `lib/schema.ts`
- Modify: `tests/helpers/test-db.ts`
- Create: `drizzle/0001_<auto>.sql` (generated)

- [ ] **Step 1: Add the `sharedLists` table to `lib/schema.ts`**

Append to the end of `lib/schema.ts`:

```ts
import { jsonb, uuid } from "drizzle-orm/pg-core";

export type SavedRouteJson = {
  id: number;
  name: string;
  area: string | null;
  grade: string | null;
};

export const sharedLists = pgTable("shared_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  routes: jsonb("routes").$type<SavedRouteJson[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SharedList = typeof sharedLists.$inferSelect;
```

Merge the new imports (`jsonb`, `uuid`) into the existing import line at the top — final import should read:

```ts
import { bigint, doublePrecision, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new file appears under `drizzle/` (something like `0001_*.sql`) containing `CREATE TABLE "shared_lists" (...)` with `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`. If drizzle emits a `CREATE EXTENSION IF NOT EXISTS "pgcrypto"` line first, keep it — `gen_random_uuid()` is in pg_catalog on Postgres 13+, but the extension is harmless.

- [ ] **Step 3: Apply the migration to dev and test DBs**

Run: `npm run db:migrate`
Expected: "applied 1 migration" (or similar) and no error.

Run: `npm run db:migrate:test`
Expected: same.

Verify with: `docker compose exec postgres psql -U crag -d crag_test -c "\d shared_lists"`
Expected: table description showing `id uuid`, `routes jsonb`, `created_at`, `updated_at`.

- [ ] **Step 4: Extend `truncateAll()` to clear `shared_lists`**

Modify `tests/helpers/test-db.ts:11`:

```ts
export async function truncateAll() {
  await testDb.execute(sql`TRUNCATE TABLE shared_lists, route_meta, routes RESTART IDENTITY CASCADE`);
}
```

- [ ] **Step 5: Verify nothing breaks**

Run: `npm test`
Expected: all existing tests still pass (no new tests yet).

- [ ] **Step 6: Commit**

```bash
git add lib/schema.ts drizzle/ tests/helpers/test-db.ts
git commit -m "feat: add shared_lists table for cross-device saved routes"
```

---

## Task 2: Body validator helper

**Model:** claude-sonnet-4-6

**Files:**
- Create: `lib/list-validation.ts`
- Create: `tests/lib/list-validation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/list-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateRoutesBody } from "@/lib/list-validation";

describe("validateRoutesBody", () => {
  const good = { id: 1, name: "The Nose", area: "Yosemite", grade: "5.9" };

  it("accepts a valid routes array", () => {
    expect(validateRoutesBody({ routes: [good] })).toEqual([good]);
  });

  it("accepts an empty routes array", () => {
    expect(validateRoutesBody({ routes: [] })).toEqual([]);
  });

  it("accepts area and grade as null", () => {
    expect(validateRoutesBody({ routes: [{ id: 1, name: "x", area: null, grade: null }] }))
      .toEqual([{ id: 1, name: "x", area: null, grade: null }]);
  });

  it("rejects non-object body", () => {
    expect(validateRoutesBody(null)).toBeNull();
    expect(validateRoutesBody("nope")).toBeNull();
  });

  it("rejects missing routes field", () => {
    expect(validateRoutesBody({})).toBeNull();
  });

  it("rejects non-array routes", () => {
    expect(validateRoutesBody({ routes: "x" })).toBeNull();
  });

  it("rejects more than 50 routes", () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ ...good, id: i }));
    expect(validateRoutesBody({ routes: many })).toBeNull();
  });

  it("rejects item with non-number id", () => {
    expect(validateRoutesBody({ routes: [{ ...good, id: "1" }] })).toBeNull();
  });

  it("rejects item with non-string name", () => {
    expect(validateRoutesBody({ routes: [{ ...good, name: 123 }] })).toBeNull();
  });

  it("rejects item with non-string non-null area", () => {
    expect(validateRoutesBody({ routes: [{ ...good, area: 123 }] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/lib/list-validation.test.ts`
Expected: FAIL — cannot find module `@/lib/list-validation`.

- [ ] **Step 3: Write the validator**

Create `lib/list-validation.ts`:

```ts
import type { SavedRouteJson } from "./schema";

const MAX_ROUTES = 50;

export function validateRoutesBody(body: unknown): SavedRouteJson[] | null {
  if (!body || typeof body !== "object") return null;
  const routes = (body as { routes?: unknown }).routes;
  if (!Array.isArray(routes)) return null;
  if (routes.length > MAX_ROUTES) return null;

  const out: SavedRouteJson[] = [];
  for (const r of routes) {
    if (!r || typeof r !== "object") return null;
    const rec = r as Record<string, unknown>;
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
  return out;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/lib/list-validation.test.ts`
Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/list-validation.ts tests/lib/list-validation.test.ts
git commit -m "feat: add validateRoutesBody helper for /api/list payloads"
```

---

## Task 3: POST /api/list endpoint

**Model:** claude-sonnet-4-6

**Files:**
- Create: `app/api/list/route.ts`
- Create: `tests/api/list.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/list.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/list/route";
import { testDb, truncateAll, closeDb } from "../helpers/test-db";
import { sharedLists } from "@/lib/schema";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

function reqWith(body: unknown) {
  return new Request("http://localhost/api/list", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/list", () => {
  it("creates a list and returns its uuid", async () => {
    const routes = [{ id: 1, name: "The Nose", area: "Yosemite", grade: "5.9" }];
    const res = await POST(reqWith({ routes }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.id).toMatch(/^[0-9a-f-]{36}$/);

    const rows = await testDb.query.sharedLists.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].routes).toEqual(routes);
  });

  it("accepts an empty routes array", async () => {
    const res = await POST(reqWith({ routes: [] }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects malformed body with 400", async () => {
    const res = await POST(reqWith({ routes: "not-an-array" }));
    expect(res.status).toBe(400);
  });

  it("rejects > 50 routes with 400", async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({
      id: i, name: `r${i}`, area: null, grade: null,
    }));
    const res = await POST(reqWith({ routes: many }));
    expect(res.status).toBe(400);
  });

  it("rejects non-JSON body with 400", async () => {
    const req = new Request("http://localhost/api/list", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/api/list.test.ts`
Expected: FAIL — cannot find module `@/app/api/list/route`.

- [ ] **Step 3: Write the POST handler**

Create `app/api/list/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sharedLists } from "@/lib/schema";
import { validateRoutesBody } from "@/lib/list-validation";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const routes = validateRoutesBody(body);
  if (!routes) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const [row] = await db.insert(sharedLists).values({ routes }).returning({ id: sharedLists.id });
  return NextResponse.json({ id: row.id });
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/api/list.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/list/route.ts tests/api/list.test.ts
git commit -m "feat: add POST /api/list to create a shared list"
```

---

## Task 4: GET /api/list/[id] endpoint

**Model:** claude-sonnet-4-6

**Files:**
- Create: `app/api/list/[id]/route.ts`
- Modify: `tests/api/list.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `tests/api/list.test.ts`:

```ts
import { GET, PUT } from "@/app/api/list/[id]/route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/list/[id]", () => {
  it("returns the routes for an existing list", async () => {
    const routes = [{ id: 7, name: "Astroman", area: "Yosemite", grade: "5.11c" }];
    const [row] = await testDb.insert(sharedLists).values({ routes }).returning({ id: sharedLists.id });

    const res = await GET(new Request(`http://localhost/api/list/${row.id}`), ctx(row.id));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.routes).toEqual(routes);
  });

  it("returns 404 for unknown id", async () => {
    const fakeUuid = "00000000-0000-0000-0000-000000000000";
    const res = await GET(new Request(`http://localhost/api/list/${fakeUuid}`), ctx(fakeUuid));
    expect(res.status).toBe(404);
  });

  it("returns 400 for malformed uuid", async () => {
    const res = await GET(new Request("http://localhost/api/list/not-a-uuid"), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run tests/api/list.test.ts`
Expected: FAIL — cannot find module `@/app/api/list/[id]/route`.

- [ ] **Step 3: Write the GET handler (and stub PUT for the next task)**

Create `app/api/list/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sharedLists } from "@/lib/schema";
import { validateRoutesBody } from "@/lib/list-validation";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  const row = await db.query.sharedLists.findFirst({ where: eq(sharedLists.id, id) });
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ routes: row.routes });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const routes = validateRoutesBody(body);
  if (!routes) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const result = await db
    .update(sharedLists)
    .set({ routes, updatedAt: new Date() })
    .where(eq(sharedLists.id, id))
    .returning({ id: sharedLists.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run tests/api/list.test.ts`
Expected: 8 tests pass total (5 from Task 3 + 3 here).

- [ ] **Step 5: Commit**

```bash
git add app/api/list/[id]/route.ts tests/api/list.test.ts
git commit -m "feat: add GET /api/list/[id] (PUT handler stubbed alongside)"
```

---

## Task 5: PUT /api/list/[id] tests

**Model:** claude-sonnet-4-6

**Files:**
- Modify: `tests/api/list.test.ts`

The PUT handler is already implemented in Task 4 — this task adds the tests that exercise it.

- [ ] **Step 1: Append failing tests**

Append to `tests/api/list.test.ts`:

```ts
describe("PUT /api/list/[id]", () => {
  function putReq(id: string, body: unknown) {
    return new Request(`http://localhost/api/list/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("replaces routes for an existing list", async () => {
    const original = [{ id: 1, name: "A", area: null, grade: null }];
    const updated = [
      { id: 1, name: "A", area: null, grade: null },
      { id: 2, name: "B", area: "Yosemite", grade: "5.10" },
    ];
    const [row] = await testDb.insert(sharedLists).values({ routes: original }).returning({ id: sharedLists.id });

    const res = await PUT(putReq(row.id, { routes: updated }), ctx(row.id));
    expect(res.status).toBe(200);

    const after = await testDb.query.sharedLists.findFirst();
    expect(after?.routes).toEqual(updated);
  });

  it("bumps updated_at", async () => {
    const [row] = await testDb.insert(sharedLists).values({ routes: [] }).returning({ id: sharedLists.id });
    const before = await testDb.query.sharedLists.findFirst();

    // wait a moment so timestamps differ
    await new Promise((r) => setTimeout(r, 20));
    await PUT(putReq(row.id, { routes: [{ id: 1, name: "x", area: null, grade: null }] }), ctx(row.id));

    const after = await testDb.query.sharedLists.findFirst();
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
  });

  it("returns 404 for unknown id", async () => {
    const fakeUuid = "00000000-0000-0000-0000-000000000000";
    const res = await PUT(putReq(fakeUuid, { routes: [] }), ctx(fakeUuid));
    expect(res.status).toBe(404);
  });

  it("returns 400 for malformed uuid", async () => {
    const res = await PUT(putReq("nope", { routes: [] }), ctx("nope"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for > 50 routes", async () => {
    const [row] = await testDb.insert(sharedLists).values({ routes: [] }).returning({ id: sharedLists.id });
    const many = Array.from({ length: 51 }, (_, i) => ({ id: i, name: `r${i}`, area: null, grade: null }));
    const res = await PUT(putReq(row.id, { routes: many }), ctx(row.id));
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed body", async () => {
    const [row] = await testDb.insert(sharedLists).values({ routes: [] }).returning({ id: sharedLists.id });
    const res = await PUT(putReq(row.id, { routes: "nope" }), ctx(row.id));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests and verify they pass**

Run: `npx vitest run tests/api/list.test.ts`
Expected: 14 tests pass (8 + 6).

- [ ] **Step 3: Commit**

```bash
git add tests/api/list.test.ts
git commit -m "test: add PUT /api/list/[id] coverage"
```

---

## Task 6: Linked mode in `useFavorites`

**Model:** claude-sonnet-4-6

**Files:**
- Modify: `lib/favorites.ts`
- Modify: `tests/lib/favorites.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `tests/lib/favorites.test.ts`:

```ts
import { waitFor } from "@testing-library/react";
import { vi } from "vitest";

function mockFetchOk(body: unknown) {
  return vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
}

describe("useFavorites linked mode", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("listId is null when cw_list_id is not set", () => {
    const { result } = renderHook(() => useFavorites());
    expect(result.current.listId).toBeNull();
  });

  it("reads cw_list_id from localStorage on mount", () => {
    localStorage.setItem("cw_list_id", "00000000-0000-0000-0000-000000000001");
    mockFetchOk({ routes: [] });
    const { result } = renderHook(() => useFavorites());
    expect(result.current.listId).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("fetches from server on mount when linked and replaces local state", async () => {
    localStorage.setItem("cw_list_id", "00000000-0000-0000-0000-000000000001");
    localStorage.setItem("cw_favorites", JSON.stringify([r1])); // stale local
    const fetchSpy = mockFetchOk({ routes: [r2] });

    const { result } = renderHook(() => useFavorites());

    await waitFor(() => expect(result.current.favorites).toEqual([r2]));
    expect(fetchSpy).toHaveBeenCalledWith("/api/list/00000000-0000-0000-0000-000000000001");
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual([r2]);
  });

  it("PUTs to server on toggle when linked", async () => {
    localStorage.setItem("cw_list_id", "00000000-0000-0000-0000-000000000001");
    const fetchSpy = mockFetchOk({ routes: [] });

    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled()); // initial GET

    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    act(() => { result.current.toggle(r1); });

    await waitFor(() => {
      const putCall = fetchSpy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "PUT");
      expect(putCall).toBeDefined();
      expect(putCall![0]).toBe("/api/list/00000000-0000-0000-0000-000000000001");
      expect(JSON.parse((putCall![1] as RequestInit).body as string)).toEqual({ routes: [r1] });
    });
  });

  it("does not call fetch on toggle when not linked", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("PUT failure does not break local write", async () => {
    localStorage.setItem("cw_list_id", "00000000-0000-0000-0000-000000000001");
    const fetchSpy = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ routes: [] }), { status: 200 }))
      .mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    act(() => { result.current.toggle(r1); });
    expect(result.current.favorites).toEqual([r1]);
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual([r1]);
  });

  it("createSyncedList POSTs current favorites and sets cw_list_id", async () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "00000000-0000-0000-0000-000000000002" }), { status: 200 }),
    );

    let returnedId: string | null = null;
    await act(async () => {
      returnedId = await result.current.createSyncedList();
    });

    expect(returnedId).toBe("00000000-0000-0000-0000-000000000002");
    expect(result.current.listId).toBe("00000000-0000-0000-0000-000000000002");
    expect(localStorage.getItem("cw_list_id")).toBe("00000000-0000-0000-0000-000000000002");

    const postCall = fetchSpy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST");
    expect(postCall).toBeDefined();
    expect(postCall![0]).toBe("/api/list");
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toEqual({ routes: [r1] });
  });

  it("link(id, routes) sets cw_list_id and replaces favorites", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => {
      result.current.link("00000000-0000-0000-0000-000000000003", [r2]);
    });
    expect(result.current.listId).toBe("00000000-0000-0000-0000-000000000003");
    expect(result.current.favorites).toEqual([r2]);
    expect(localStorage.getItem("cw_list_id")).toBe("00000000-0000-0000-0000-000000000003");
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual([r2]);
  });

  it("unlink clears cw_list_id and keeps local favorites", () => {
    localStorage.setItem("cw_list_id", "00000000-0000-0000-0000-000000000004");
    mockFetchOk({ routes: [r1] });
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.unlink(); });
    expect(result.current.listId).toBeNull();
    expect(localStorage.getItem("cw_list_id")).toBeNull();
    expect(result.current.favorites).toEqual([r1]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run tests/lib/favorites.test.ts`
Expected: FAIL — `result.current.listId`, `createSyncedList`, `link`, `unlink` do not exist.

- [ ] **Step 3: Rewrite `lib/favorites.ts` for linked mode**

Replace the entire contents of `lib/favorites.ts`:

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

function readFavorites(): SavedRoute[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedRoute[];
  } catch {
    localStorage.setItem(FAV_KEY, "[]");
    return [];
  }
}

function writeFavorites(routes: SavedRoute[]) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(routes));
  } catch {
    // quota exceeded — silently ignore
  }
}

function readListId(): string | null {
  try {
    return localStorage.getItem(LIST_ID_KEY);
  } catch {
    return null;
  }
}

async function putRemote(listId: string, routes: SavedRoute[]) {
  try {
    await fetch(`/api/list/${listId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ routes }),
    });
  } catch {
    // network errors are tolerated — local write already succeeded
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<SavedRoute[]>([]);
  const [listId, setListId] = useState<string | null>(null);
  const listIdRef = useRef<string | null>(null);

  useEffect(() => {
    const id = readListId();
    listIdRef.current = id;
    setListId(id);
    setFavorites(readFavorites());

    if (id) {
      (async () => {
        try {
          const res = await fetch(`/api/list/${id}`);
          if (!res.ok) return;
          const j = (await res.json()) as { routes: SavedRoute[] };
          setFavorites(j.routes);
          writeFavorites(j.routes);
        } catch {
          // keep local cache
        }
      })();
    }
  }, []);

  const isSaved = useCallback(
    (id: number) => favorites.some((r) => r.id === id),
    [favorites],
  );

  const writeAndSync = useCallback((next: SavedRoute[]) => {
    writeFavorites(next);
    const id = listIdRef.current;
    if (id) void putRemote(id, next);
  }, []);

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

  const remove = useCallback((id: number) => {
    setFavorites((prev) => {
      const next = prev.filter((r) => r.id !== id);
      writeAndSync(next);
      return next;
    });
  }, [writeAndSync]);

  const createSyncedList = useCallback(async (): Promise<string | null> => {
    const current = readFavorites();
    try {
      const res = await fetch("/api/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ routes: current }),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { id: string };
      localStorage.setItem(LIST_ID_KEY, j.id);
      listIdRef.current = j.id;
      setListId(j.id);
      return j.id;
    } catch {
      return null;
    }
  }, []);

  const link = useCallback((id: string, routes: SavedRoute[]) => {
    localStorage.setItem(LIST_ID_KEY, id);
    listIdRef.current = id;
    setListId(id);
    writeFavorites(routes);
    setFavorites(routes);
  }, []);

  const unlink = useCallback(() => {
    localStorage.removeItem(LIST_ID_KEY);
    listIdRef.current = null;
    setListId(null);
  }, []);

  return { favorites, isSaved, toggle, remove, listId, createSyncedList, link, unlink };
}
```

- [ ] **Step 4: Run all favorites tests**

Run: `npx vitest run tests/lib/favorites.test.ts`
Expected: all old tests still pass + 9 new linked-mode tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/favorites.ts tests/lib/favorites.test.ts
git commit -m "feat: add linked-mode sync to useFavorites"
```

---

## Task 7: Install qrcode.react

**Model:** claude-haiku-4-5-20251001

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the package**

Run: `npm install qrcode.react`
Expected: `qrcode.react` appears under `dependencies` in `package.json`.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add qrcode.react for shared-list QR rendering"
```

---

## Task 8: SyncModal component

**Model:** claude-sonnet-4-6

**Files:**
- Create: `components/SyncModal.tsx`
- Create: `tests/components/SyncModal.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/SyncModal.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncModal } from "@/components/SyncModal";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("SyncModal", () => {
  it("when not linked, shows a create-list button", () => {
    render(<SyncModal open onClose={() => {}} />);
    expect(screen.getByRole("button", { name: /create shared list/i })).toBeInTheDocument();
    expect(screen.queryByText(/^https?:\/\//)).not.toBeInTheDocument();
  });

  it("creating a list shows the URL", async () => {
    localStorage.setItem("cw_favorites", JSON.stringify([{ id: 1, name: "x", area: null, grade: null }]));
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "abcd1234-0000-0000-0000-000000000001" }), { status: 200 }),
    );

    render(<SyncModal open onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /create shared list/i }));

    await waitFor(() => {
      expect(screen.getByText(/abcd1234-0000-0000-0000-000000000001/)).toBeInTheDocument();
    });
    expect(fetchSpy).toHaveBeenCalledWith("/api/list", expect.objectContaining({ method: "POST" }));
  });

  it("when already linked, shows existing URL and an unlink button", () => {
    localStorage.setItem("cw_list_id", "abcd1234-0000-0000-0000-000000000002");
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ routes: [] }), { status: 200 }),
    );

    render(<SyncModal open onClose={() => {}} />);
    expect(screen.getByText(/abcd1234-0000-0000-0000-000000000002/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unlink this device/i })).toBeInTheDocument();
  });

  it("unlink clears localStorage and closes the modal", async () => {
    localStorage.setItem("cw_list_id", "abcd1234-0000-0000-0000-000000000003");
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ routes: [] }), { status: 200 }),
    );
    const onClose = vi.fn();
    render(<SyncModal open onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: /unlink this device/i }));
    expect(localStorage.getItem("cw_list_id")).toBeNull();
    expect(onClose).toHaveBeenCalled();
  });

  it("does not render anything when open is false", () => {
    const { container } = render(<SyncModal open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run tests/components/SyncModal.test.tsx`
Expected: FAIL — cannot find module `@/components/SyncModal`.

- [ ] **Step 3: Create the component**

Create `components/SyncModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useFavorites } from "@/lib/favorites";

export function SyncModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { listId, createSyncedList, unlink } = useFavorites();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const shareUrl = listId
    ? (typeof window !== "undefined" ? `${window.location.origin}/list/${listId}` : `/list/${listId}`)
    : null;

  async function handleCreate() {
    setPending(true);
    setError(null);
    const id = await createSyncedList();
    setPending(false);
    if (!id) setError("Could not create shared list. Try again.");
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // ignore — user can still select the text
    }
  }

  function handleUnlink() {
    unlink();
    onClose();
  }

  return (
    <div className="sync-modal" role="dialog" aria-modal="true" aria-label="Sync saved routes">
      <div className="sync-modal__backdrop" onClick={onClose} />
      <div className="sync-modal__panel">
        <button className="sync-modal__close" onClick={onClose} aria-label="Close">×</button>
        <h2>Sync to another device</h2>

        {!listId && (
          <>
            <p>Create a shareable link, then open it on your other device.</p>
            <button onClick={handleCreate} disabled={pending}>
              {pending ? "Creating…" : "Create shared list"}
            </button>
            {error && <p className="sync-modal__error">{error}</p>}
          </>
        )}

        {listId && shareUrl && (
          <>
            <p>Open this link on your other device to sync.</p>
            <div className="sync-modal__url">
              <code>{shareUrl}</code>
              <button onClick={handleCopy}>Copy</button>
            </div>
            <div className="sync-modal__qr">
              <QRCodeSVG value={shareUrl} size={180} />
            </div>
            <button className="sync-modal__unlink" onClick={handleUnlink}>
              Unlink this device
            </button>
            <p className="sync-modal__hint">
              Unlinking only affects this device. Other linked devices keep working.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run tests/components/SyncModal.test.tsx`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/SyncModal.tsx tests/components/SyncModal.test.tsx
git commit -m "feat: add SyncModal with URL, QR code, and unlink"
```

---

## Task 9: SavedRoutes — show area/grade, add sync button and synced badge

**Model:** claude-sonnet-4-6

**Files:**
- Modify: `components/SavedRoutes.tsx`
- Modify: `tests/components/HomePage.test.tsx` (if it touches SavedRoutes — see Step 1)
- Create: `tests/components/SavedRoutes.test.tsx`

- [ ] **Step 1: Check whether existing tests cover SavedRoutes**

Run: `grep -l "SavedRoutes\|Saved routes\|cw_favorites" tests/components/*.tsx 2>/dev/null || echo none`
If any file matches, read it before modifying SavedRoutes so you don't break assertions.

- [ ] **Step 2: Write the failing tests for the new SavedRoutes**

Create `tests/components/SavedRoutes.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SavedRoutes } from "@/components/SavedRoutes";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("SavedRoutes", () => {
  it("renders nothing when there are no favorites", () => {
    const { container } = render(<SavedRoutes />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders area and grade for each saved route", () => {
    localStorage.setItem(
      "cw_favorites",
      JSON.stringify([{ id: 1, name: "The Nose", area: "Yosemite > El Cap", grade: "5.9" }]),
    );
    render(<SavedRoutes />);
    expect(screen.getByText("The Nose")).toBeInTheDocument();
    expect(screen.getByText(/Yosemite > El Cap/)).toBeInTheDocument();
    expect(screen.getByText(/5\.9/)).toBeInTheDocument();
  });

  it("renders without area/grade gracefully when null", () => {
    localStorage.setItem(
      "cw_favorites",
      JSON.stringify([{ id: 1, name: "Unnamed", area: null, grade: null }]),
    );
    render(<SavedRoutes />);
    expect(screen.getByText("Unnamed")).toBeInTheDocument();
  });

  it("shows the Synced badge when cw_list_id is set", () => {
    localStorage.setItem("cw_list_id", "abcd1234-0000-0000-0000-000000000001");
    localStorage.setItem("cw_favorites", JSON.stringify([{ id: 1, name: "x", area: null, grade: null }]));
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ routes: [{ id: 1, name: "x", area: null, grade: null }] }), { status: 200 }),
    );
    render(<SavedRoutes />);
    expect(screen.getByText(/synced/i)).toBeInTheDocument();
  });

  it("opens the sync modal when the sync button is clicked", async () => {
    localStorage.setItem("cw_favorites", JSON.stringify([{ id: 1, name: "x", area: null, grade: null }]));
    render(<SavedRoutes />);
    await userEvent.click(screen.getByRole("button", { name: /sync to another device/i }));
    expect(screen.getByRole("dialog", { name: /sync saved routes/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `npx vitest run tests/components/SavedRoutes.test.tsx`
Expected: FAIL — area/grade not rendered, no badge, no sync button.

- [ ] **Step 4: Rewrite SavedRoutes**

Replace `components/SavedRoutes.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useFavorites } from "@/lib/favorites";
import { SyncModal } from "@/components/SyncModal";

export function SavedRoutes() {
  const { favorites, remove, listId } = useFavorites();
  const [modalOpen, setModalOpen] = useState(false);

  if (favorites.length === 0) return null;

  return (
    <section className="home-popular">
      <h2>
        Saved routes
        {listId && <span className="saved-synced-badge"> · Synced</span>}
      </h2>
      <ul>
        {favorites.map((r) => (
          <li key={r.id} className="saved-card">
            <Link href={`/route/${r.id}`} className="saved-card-link">
              <span className="saved-card-name">{r.name}</span>
              {(r.area || r.grade) && (
                <span className="saved-card-meta">
                  {r.area && <span className="saved-card-area">{r.area}</span>}
                  {r.area && r.grade && <span className="saved-card-sep"> · </span>}
                  {r.grade && <span className="saved-card-grade">{r.grade}</span>}
                </span>
              )}
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
      <div className="saved-sync-actions">
        <button onClick={() => setModalOpen(true)}>
          {listId ? "Synced — show QR" : "Sync to another device"}
        </button>
      </div>
      <SyncModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </section>
  );
}
```

- [ ] **Step 5: Run the SavedRoutes tests**

Run: `npx vitest run tests/components/SavedRoutes.test.tsx`
Expected: 5 tests pass.

- [ ] **Step 6: Run the full suite to confirm nothing regressed**

Run: `npm test`
Expected: every test in the project passes. If `HomePage.test.tsx` or other suites break because they assume the old SavedRoutes markup, update those tests to match the new structure (`saved-card-link` wrapping the name + meta) — keep the assertions semantic where possible (`getByText("The Nose")` still works).

- [ ] **Step 7: Commit**

```bash
git add components/SavedRoutes.tsx tests/components/SavedRoutes.test.tsx tests/components/HomePage.test.tsx
git commit -m "feat: show area/grade in SavedRoutes and add sync entry point"
```

(Drop the `tests/components/HomePage.test.tsx` from the `git add` if you didn't end up modifying it.)

---

## Task 10: `/list/[id]` confirmation page

**Model:** claude-sonnet-4-6

**Files:**
- Create: `app/list/[id]/page.tsx`
- Create: `app/list/[id]/ConfirmJoin.tsx`
- Create: `tests/components/ConfirmJoin.test.tsx`

- [ ] **Step 1: Write the failing tests for the client confirmation component**

Create `tests/components/ConfirmJoin.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmJoin } from "@/app/list/[id]/ConfirmJoin";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

beforeEach(() => {
  localStorage.clear();
  pushMock.mockReset();
});

const listId = "abcd1234-0000-0000-0000-000000000001";
const sharedRoutes = [
  { id: 1, name: "The Nose", area: "Yosemite", grade: "5.9" },
  { id: 2, name: "Astroman", area: "Yosemite", grade: "5.11c" },
];

describe("ConfirmJoin", () => {
  it("shows the route count from the shared list", () => {
    render(<ConfirmJoin listId={listId} routes={sharedRoutes} />);
    expect(screen.getByText(/2 routes/i)).toBeInTheDocument();
  });

  it("warns when local favorites will be replaced", () => {
    localStorage.setItem(
      "cw_favorites",
      JSON.stringify([{ id: 99, name: "Other", area: null, grade: null }]),
    );
    render(<ConfirmJoin listId={listId} routes={sharedRoutes} />);
    expect(screen.getByText(/1 local route will be replaced/i)).toBeInTheDocument();
  });

  it("warns when switching from a different synced list", () => {
    localStorage.setItem("cw_list_id", "abcd1234-0000-0000-0000-000000000999");
    render(<ConfirmJoin listId={listId} routes={sharedRoutes} />);
    expect(screen.getByText(/already synced to a different list/i)).toBeInTheDocument();
  });

  it("Link this device writes cw_list_id + favorites and redirects home", async () => {
    render(<ConfirmJoin listId={listId} routes={sharedRoutes} />);
    await userEvent.click(screen.getByRole("button", { name: /link this device/i }));
    expect(localStorage.getItem("cw_list_id")).toBe(listId);
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual(sharedRoutes);
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("Cancel navigates home without writing", async () => {
    render(<ConfirmJoin listId={listId} routes={sharedRoutes} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(localStorage.getItem("cw_list_id")).toBeNull();
    expect(pushMock).toHaveBeenCalledWith("/");
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run tests/components/ConfirmJoin.test.tsx`
Expected: FAIL — cannot find module `@/app/list/[id]/ConfirmJoin`.

- [ ] **Step 3: Create the ConfirmJoin client component**

Create `app/list/[id]/ConfirmJoin.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFavorites, type SavedRoute } from "@/lib/favorites";

export function ConfirmJoin({ listId, routes }: { listId: string; routes: SavedRoute[] }) {
  const router = useRouter();
  const { link } = useFavorites();
  const [localCount, setLocalCount] = useState(0);
  const [existingListId, setExistingListId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cw_favorites");
      const arr = raw ? (JSON.parse(raw) as unknown[]) : [];
      setLocalCount(Array.isArray(arr) ? arr.length : 0);
    } catch {
      setLocalCount(0);
    }
    setExistingListId(localStorage.getItem("cw_list_id"));
  }, []);

  const willReplace = localCount > 0 && existingListId !== listId;
  const isSwitching = existingListId !== null && existingListId !== listId;

  function handleLink() {
    link(listId, routes);
    router.push("/");
  }

  function handleCancel() {
    router.push("/");
  }

  return (
    <main className="confirm-join">
      <h1>Join shared list</h1>
      <p>This shared list has <strong>{routes.length} routes</strong>.</p>
      <ul className="confirm-join__preview">
        {routes.slice(0, 5).map((r) => (
          <li key={r.id}>
            {r.name}
            {r.area && <span> · {r.area}</span>}
            {r.grade && <span> · {r.grade}</span>}
          </li>
        ))}
        {routes.length > 5 && <li>…and {routes.length - 5} more</li>}
      </ul>

      {isSwitching && (
        <p className="confirm-join__warn">
          This device is already synced to a different list — joining will switch to this one.
        </p>
      )}
      {willReplace && !isSwitching && (
        <p className="confirm-join__warn">
          {localCount} local route{localCount === 1 ? "" : "s"} will be replaced by this shared list.
        </p>
      )}

      <div className="confirm-join__actions">
        <button onClick={handleLink} className="confirm-join__primary">
          Link this device
        </button>
        <button onClick={handleCancel}>Cancel</button>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run the ConfirmJoin tests and verify they pass**

Run: `npx vitest run tests/components/ConfirmJoin.test.tsx`
Expected: 5 tests pass.

- [ ] **Step 5: Create the server page**

Create `app/list/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sharedLists } from "@/lib/schema";
import { ConfirmJoin } from "./ConfirmJoin";
import type { SavedRoute } from "@/lib/favorites";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SharedListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const row = await db.query.sharedLists.findFirst({ where: eq(sharedLists.id, id) });
  if (!row) notFound();

  return <ConfirmJoin listId={id} routes={row.routes as SavedRoute[]} />;
}
```

- [ ] **Step 6: Smoke test the page via the dev server**

Run: `npm run dev` in one terminal.
In another: create a shared list via `curl -X POST http://localhost:3000/api/list -H 'content-type: application/json' -d '{"routes":[{"id":1,"name":"Test","area":"X","grade":"5.10"}]}'`
Copy the returned `id`, then visit `http://localhost:3000/list/<id>` in a browser.
Expected: confirmation page shows "1 routes", with "Test · X · 5.10" in the preview, and "Link this device" / "Cancel" buttons.
Kill the dev server with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add app/list/ tests/components/ConfirmJoin.test.tsx
git commit -m "feat: add /list/[id] confirmation page for joining a shared list"
```

---

## Task 11: Styling

**Model:** claude-sonnet-4-6

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Read current styles to find SavedRoutes section**

Run: `grep -n "saved-\|home-popular" app/globals.css`
Note the existing selectors so the new rules sit near them and reuse variables.

- [ ] **Step 2: Append the new styles**

Append to `app/globals.css`:

```css
/* Saved routes — area/grade + sync */
.saved-card-link { display: flex; flex-direction: column; gap: 0.15rem; flex: 1; text-decoration: none; }
.saved-card-name { font-weight: 600; }
.saved-card-meta { font-size: 0.85rem; opacity: 0.75; }
.saved-card-sep { opacity: 0.5; }
.saved-synced-badge { font-size: 0.8rem; opacity: 0.7; font-weight: normal; }
.saved-sync-actions { margin-top: 0.75rem; }
.saved-sync-actions button {
  background: transparent;
  border: 1px solid currentColor;
  border-radius: 0.4rem;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
  font-size: 0.9rem;
}

/* Sync modal */
.sync-modal { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; }
.sync-modal__backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.5); }
.sync-modal__panel {
  position: relative; background: var(--background, white); color: var(--foreground, #111);
  padding: 1.5rem; border-radius: 0.75rem; max-width: 28rem; width: calc(100% - 2rem);
  box-shadow: 0 10px 40px rgba(0,0,0,0.3);
}
.sync-modal__close {
  position: absolute; top: 0.5rem; right: 0.5rem;
  background: transparent; border: 0; font-size: 1.5rem; cursor: pointer; color: inherit;
}
.sync-modal__url { display: flex; gap: 0.5rem; align-items: center; margin: 0.5rem 0; }
.sync-modal__url code { flex: 1; padding: 0.4rem; background: rgba(127,127,127,0.15); border-radius: 0.3rem; font-size: 0.8rem; word-break: break-all; }
.sync-modal__qr { margin: 1rem 0; display: grid; place-items: center; }
.sync-modal__qr svg { background: white; padding: 0.5rem; border-radius: 0.4rem; }
.sync-modal__unlink {
  margin-top: 1rem; background: transparent; border: 1px solid currentColor;
  padding: 0.4rem 0.75rem; border-radius: 0.4rem; cursor: pointer; color: inherit;
}
.sync-modal__hint { font-size: 0.8rem; opacity: 0.7; margin-top: 0.5rem; }
.sync-modal__error { color: #c53030; }

/* Confirm join page */
.confirm-join { max-width: 32rem; margin: 2rem auto; padding: 1rem; }
.confirm-join__preview { margin: 1rem 0; padding-left: 1.25rem; }
.confirm-join__warn { color: #b85d00; background: rgba(184, 93, 0, 0.1); padding: 0.6rem; border-radius: 0.4rem; }
.confirm-join__actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
.confirm-join__primary { font-weight: 600; }
.confirm-join__actions button {
  background: transparent; border: 1px solid currentColor;
  border-radius: 0.4rem; padding: 0.5rem 1rem; cursor: pointer; color: inherit;
}
```

- [ ] **Step 3: Visual sanity check**

Run: `npm run dev`
Open: `http://localhost:3000/`
Save a route (so SavedRoutes renders), confirm the area/grade line shows under the name and the "Sync to another device" button appears. Click the button, confirm the modal opens with the "Create shared list" button. Click it, confirm URL + QR code render.
Kill the dev server with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "style: add CSS for sync modal, synced badge, confirm join page"
```

---

## Task 12: End-to-end manual smoke test

**Model:** claude-sonnet-4-6

**Files:** (none — verification only)

This task is verification, not implementation. Do not commit anything new unless a defect is found.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Save a route, then sync**

In the browser:
1. Search for "The Nose" and open its page. Tap "Save route."
2. Return to home. Confirm "The Nose" appears under Saved routes with Yosemite / 5.9 metadata.
3. Click "Sync to another device" → "Create shared list."
4. Confirm URL + QR show and a "Synced" badge appears on the Saved routes heading.

- [ ] **Step 3: Simulate the second device**

Open the URL from step 2 in an **incognito window** (clean localStorage).
Confirm the join page shows "1 routes" with The Nose in the preview.
Tap "Link this device."
Confirm redirect to home and that The Nose appears under Saved routes with the Synced badge.

- [ ] **Step 4: Verify two-way sync**

In the incognito window, open The Nose, tap "Save route" to remove it (or save a different route via search).
Reload the original window.
Confirm the saved list reflects the change from the incognito window.

- [ ] **Step 5: Verify unlink**

In the original window, click "Synced — show QR" → "Unlink this device."
Confirm the Synced badge disappears and adding/removing routes locally no longer affects the incognito window after reload.

- [ ] **Step 6: Verify the warning when switching lists**

In the original (now unlinked) window, search and save a different route (so it has local favorites).
Create a new shared list (POST). Now visit the *first* list URL.
Confirm the page warns "already synced to a different list" because the device is currently linked to the new one.

- [ ] **Step 7: Run the full test suite once more**

Run: `npm test`
Expected: every test passes.

- [ ] **Step 8: Kill the dev server**

Ctrl+C in the dev server terminal.

If everything above worked, the feature is complete. If anything failed, file the defect into a new task (or fix inline and add a regression test).

---

## Self-review notes

- **Spec coverage:** every requirement in the spec maps to a task. Schema → T1. POST → T3. GET → T4. PUT → T4+T5. Validation → T2. `useFavorites` linked mode → T6. qrcode.react → T7. Sync modal (URL/QR/unlink) → T8. SavedRoutes area/grade + badge + sync entry → T9. `/list/[id]` page + ConfirmJoin → T10. CSS → T11. E2E smoke → T12.
- **Non-goals respected:** no auth, no expiration, no read-only mode, no merge, last-write-wins. None introduced.
- **Type consistency:** `SavedRoute` (lib/favorites.ts) and `SavedRouteJson` (lib/schema.ts) are structurally identical; the API serializes via the schema type, the client consumes via the favorites type, and JSON crossings don't change shape. `validateRoutesBody` returns `SavedRouteJson[]` and feeds into `sharedLists.routes`.
- **GET / local-write race:** acknowledged in the spec; the implementation in T6 reads the cache first then overwrites with the GET response — race window is the duration of the in-flight GET on mount, accepted as a v1 limitation.
