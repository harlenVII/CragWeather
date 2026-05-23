# MP URL Query Parameter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `?mp=<mountain-project-url>` support to the home page so users are server-redirected to `/route/:id` without touching the search UI.

**Architecture:** `app/page.tsx` reads `searchParams.mp`, runs the existing MP URL regex, and calls Next.js `redirect()` before rendering if matched. No new files. No API changes.

**Tech Stack:** Next.js App Router (server components), React, Vitest, @testing-library/react

---

### Task 1: Add the test for the `?mp=` redirect

**Files:**
- Create: `tests/components/HomePage.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/HomePage.test.tsx` with this content:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { redirect } from "next/navigation";

// Prevent actual navigation and DB calls
vi.mock("next/navigation", () => ({ redirect: vi.fn(), Link: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/components/SearchBox", () => ({ SearchBox: () => <div /> }));
vi.mock("@/lib/search", () => ({ searchRoutes: vi.fn().mockResolvedValue([]) }));

// Dynamic import so mocks are registered before the module loads
const { default: HomePage } = await import("@/app/page");

describe("HomePage ?mp= redirect", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
  });

  it("redirects to /route/:id when a valid MP URL is supplied", async () => {
    await render(
      await HomePage({
        searchParams: Promise.resolve({
          mp: "https://www.mountainproject.com/route/105748662/the-nose",
        }),
      }),
    );
    expect(redirect).toHaveBeenCalledWith("/route/105748662");
  });

  it("does not redirect when mp param is absent", async () => {
    await render(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not redirect when mp param does not match an MP URL", async () => {
    await render(
      await HomePage({
        searchParams: Promise.resolve({ mp: "https://example.com/route/123" }),
      }),
    );
    expect(redirect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/HomePage.test.tsx
```

Expected: FAIL — `HomePage` does not yet accept `searchParams`, so the redirect is never called.

---

### Task 2: Implement the redirect in `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 3: Update `app/page.tsx`**

Replace the entire file with:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchBox } from "@/components/SearchBox";
import { searchRoutes } from "@/lib/search";

const MP_URL_RE = /mountainproject\.com\/route\/(\d+)/;

const POPULAR_NAMES = [
  "The Nose",
  "Astroman",
  "Epinephrine",
  "The Naked Edge",
  "Royal Arches",
  "High Exposure",
];

async function getPopular() {
  const found = await Promise.all(POPULAR_NAMES.map((n) => searchRoutes(n, 1)));
  return found.map((rs) => rs[0]).filter((r): r is NonNullable<typeof r> => Boolean(r));
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ mp?: string }>;
}) {
  const { mp } = await searchParams;
  const match = mp ? MP_URL_RE.exec(mp) : null;
  if (match) redirect(`/route/${match[1]}`);

  const popular = await getPopular();
  return (
    <main className="home">
      <header className="home-header">
        <h1>CragWeather</h1>
        <p>14-day weather windows for climbing routes.</p>
      </header>
      <section className="home-search">
        <SearchBox />
      </section>
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
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/components/HomePage.test.tsx
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
npm test
```

Expected: all tests PASS (or same pass/fail count as before).

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx tests/components/HomePage.test.tsx
git commit -m "feat: redirect to route page when ?mp= MP URL param is supplied"
```
