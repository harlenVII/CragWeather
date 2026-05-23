# Saved Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-localStorage–backed saved/favorite routes feature with a save toggle on the route page and a "Saved routes" section on the homepage.

**Architecture:** A `useFavorites` hook in `lib/favorites.ts` owns all localStorage read/write logic and is shared by two thin client components (`SaveButton` and `SavedRoutes`) that are dropped into the existing server components as client islands. No server-side changes needed.

**Tech Stack:** React 18, Next.js 14 App Router, TypeScript, Vitest + @testing-library/react (renderHook), jsdom

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `lib/favorites.ts` | `SavedRoute` type + `useFavorites` hook (all localStorage logic) |
| Create | `tests/lib/favorites.test.ts` | Unit tests for `useFavorites` |
| Create | `components/SaveButton.tsx` | Save/unsave toggle button for the route page |
| Create | `components/SavedRoutes.tsx` | Saved routes section for the homepage |
| Modify | `app/route/[id]/page.tsx` | Add `<SaveButton>` below the MP link |
| Modify | `app/page.tsx` | Add `<SavedRoutes>` above Popular routes |
| Modify | `app/globals.css` | Add `.save-btn`, `.saved-card`, `.saved-card-remove` |

---

## Task 1: `lib/favorites.ts` — useFavorites hook (TDD)

**Files:**
- Create: `lib/favorites.ts`
- Create: `tests/lib/favorites.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/favorites.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFavorites, type SavedRoute } from "@/lib/favorites";

const r1: SavedRoute = { id: 1, name: "The Nose", area: "Yosemite", grade: "5.14" };
const r2: SavedRoute = { id: 2, name: "Astroman", area: "Yosemite", grade: "5.11c" };

describe("useFavorites", () => {
  beforeEach(() => localStorage.clear());

  it("starts empty when localStorage is empty", () => {
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites).toEqual([]);
  });

  it("adds a route via toggle", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    expect(result.current.favorites).toEqual([r1]);
  });

  it("removes a route via toggle when already saved", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    act(() => { result.current.toggle(r1); });
    expect(result.current.favorites).toEqual([]);
  });

  it("inserts newest-first", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    act(() => { result.current.toggle(r2); });
    expect(result.current.favorites[0]).toEqual(r2);
    expect(result.current.favorites[1]).toEqual(r1);
  });

  it("isSaved returns true for a saved route and false for others", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    expect(result.current.isSaved(1)).toBe(true);
    expect(result.current.isSaved(2)).toBe(false);
  });

  it("remove removes by id", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    act(() => { result.current.toggle(r2); });
    act(() => { result.current.remove(1); });
    expect(result.current.favorites).toEqual([r2]);
  });

  it("persists to localStorage after toggle", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual([r1]);
  });

  it("reads existing favorites from localStorage on mount", () => {
    localStorage.setItem("cw_favorites", JSON.stringify([r1]));
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites).toEqual([r1]);
  });

  it("recovers from malformed JSON in localStorage", () => {
    localStorage.setItem("cw_favorites", "not-json{{{");
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites).toEqual([]);
    expect(localStorage.getItem("cw_favorites")).toBe("[]");
  });

  it("caps favorites at 50 entries", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => {
      for (let i = 0; i < 55; i++) {
        result.current.toggle({ id: i, name: `Route ${i}`, area: null, grade: null });
      }
    });
    expect(result.current.favorites.length).toBe(50);
  });
});
```

- [ ] **Step 2: Run tests — confirm all fail**

```bash
npx vitest run tests/lib/favorites.test.ts
```

Expected: all 10 tests fail with `Cannot find module '@/lib/favorites'`.

- [ ] **Step 3: Implement `lib/favorites.ts`**

Create `lib/favorites.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "cw_favorites";
const MAX = 50;

export type SavedRoute = {
  id: number;
  name: string;
  area: string | null;
  grade: string | null;
};

function readStorage(): SavedRoute[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedRoute[];
  } catch {
    localStorage.setItem(KEY, "[]");
    return [];
  }
}

function writeStorage(routes: SavedRoute[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(routes));
  } catch {
    // quota exceeded — silently ignore
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<SavedRoute[]>([]);

  useEffect(() => {
    setFavorites(readStorage());
  }, []);

  const isSaved = useCallback(
    (id: number) => favorites.some((r) => r.id === id),
    [favorites]
  );

  const toggle = useCallback((route: SavedRoute) => {
    setFavorites((prev) => {
      const exists = prev.some((r) => r.id === route.id);
      const next = exists
        ? prev.filter((r) => r.id !== route.id)
        : [route, ...prev].slice(0, MAX);
      writeStorage(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: number) => {
    setFavorites((prev) => {
      const next = prev.filter((r) => r.id !== id);
      writeStorage(next);
      return next;
    });
  }, []);

  return { favorites, isSaved, toggle, remove };
}
```

- [ ] **Step 4: Run tests — confirm all pass**

```bash
npx vitest run tests/lib/favorites.test.ts
```

Expected: 10 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add lib/favorites.ts tests/lib/favorites.test.ts
git commit -m "feat: add useFavorites hook with localStorage persistence"
```

---

## Task 2: `components/SaveButton.tsx`

**Files:**
- Create: `components/SaveButton.tsx`

No separate component test needed — the hook tests cover all logic; `SaveButton` is a pure rendering wrapper.

- [ ] **Step 1: Create `components/SaveButton.tsx`**

```tsx
"use client";

import { useFavorites, type SavedRoute } from "@/lib/favorites";

export function SaveButton({ route }: { route: SavedRoute }) {
  const { isSaved, toggle } = useFavorites();
  const saved = isSaved(route.id);

  return (
    <button className="save-btn" onClick={() => toggle(route)}>
      {saved ? "Saved ✓" : "Save route"}
    </button>
  );
}
```

- [ ] **Step 2: Confirm TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/SaveButton.tsx
git commit -m "feat: add SaveButton client component"
```

---

## Task 3: `components/SavedRoutes.tsx`

**Files:**
- Create: `components/SavedRoutes.tsx`

- [ ] **Step 1: Create `components/SavedRoutes.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useFavorites } from "@/lib/favorites";

export function SavedRoutes() {
  const { favorites, remove } = useFavorites();

  if (favorites.length === 0) return null;

  return (
    <section className="home-popular">
      <h2>Saved routes</h2>
      <ul>
        {favorites.map((r) => (
          <li key={r.id} className="saved-card">
            <Link href={`/route/${r.id}`}>{r.name}</Link>
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
    </section>
  );
}
```

- [ ] **Step 2: Confirm TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/SavedRoutes.tsx
git commit -m "feat: add SavedRoutes client component"
```

---

## Task 4: Wire SaveButton into the route page

**Files:**
- Modify: `app/route/[id]/page.tsx`

- [ ] **Step 1: Import SaveButton and pass route data**

In `app/route/[id]/page.tsx`, add the import at the top:

```ts
import { SaveButton } from "@/components/SaveButton";
```

Then inside the JSX, replace:

```tsx
        <p>
          <a href={route.mpUrl} target="_blank" rel="noreferrer">
            View on Mountain Project ↗
          </a>
        </p>
```

with:

```tsx
        <p>
          <a href={route.mpUrl} target="_blank" rel="noreferrer">
            View on Mountain Project ↗
          </a>
        </p>
        <SaveButton
          route={{
            id: route.id,
            name: route.name,
            area: route.area,
            grade: route.grade,
          }}
        />
```

- [ ] **Step 2: Confirm TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/route/[id]/page.tsx
git commit -m "feat: add SaveButton to route page"
```

---

## Task 5: Wire SavedRoutes into the homepage

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Import SavedRoutes and add section above Popular**

In `app/page.tsx`, add the import at the top:

```ts
import { SavedRoutes } from "@/components/SavedRoutes";
```

Then inside the JSX, add `<SavedRoutes />` just before the popular section:

```tsx
      <SavedRoutes />
      {popular.length > 0 && (
        <section className="home-popular">
```

The full updated return becomes:

```tsx
  return (
    <main className="home">
      <header className="home-header">
        <h1>CragWeather</h1>
        <p>14-day weather windows for climbing routes.</p>
      </header>
      <section className="home-search">
        <SearchBox />
      </section>
      <SavedRoutes />
      {popular.length > 0 && (
        <section className="home-popular">
          <h2>Popular routes</h2>
          <ul>
            {popular.map((r) => (
              <li key={r.id}>
                <Link href={`/route/${r.id}`}>{r.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <footer className="home-footer">
        <Link href="/about">About &amp; data sources</Link>
      </footer>
    </main>
  );
```

- [ ] **Step 2: Confirm TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add SavedRoutes section to homepage"
```

---

## Task 6: Add CSS

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Append new CSS rules**

Add the following at the end of `app/globals.css`:

```css
.save-btn {
  padding: 0.4rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  background: var(--card);
  color: var(--fg);
  cursor: pointer;
  font: inherit;
  font-size: 0.875rem;
  margin-top: 0.5rem;
}
.save-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.saved-card { position: relative; }
.saved-card a { padding-right: 2rem; }
.saved-card-remove {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--muted);
  font-size: 1.1rem;
  line-height: 1;
  padding: 0.2rem 0.4rem;
  border-radius: 0.25rem;
}
.saved-card-remove:hover { color: var(--accent); }
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Final commit**

```bash
git add app/globals.css
git commit -m "feat: add CSS for save button and saved route cards"
```
