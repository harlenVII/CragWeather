# MP URL Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user pastes a Mountain Project route URL into the search box, navigate directly to `/route/{id}` instead of performing a fuzzy text search.

**Architecture:** Add `useRouter` from `next/navigation` to `SearchBox`. In the `useEffect` that watches `q`, run a regex before the debounce logic — if the input contains a MP route URL pattern, call `router.push` immediately and return early.

**Tech Stack:** Next.js 14 (App Router), React, Vitest, @testing-library/react, @testing-library/user-event, MSW

---

## File Map

| File | Change |
|------|--------|
| `components/SearchBox.tsx` | Add `useRouter`, add MP URL detection before debounce |
| `tests/components/SearchBox.test.tsx` | Add `vi.mock("next/navigation")`, add two new tests |

---

### Task 1: Add URL detection to SearchBox (TDD)

**Files:**
- Modify: `tests/components/SearchBox.test.tsx`
- Modify: `components/SearchBox.tsx`

- [ ] **Step 1: Add the `next/navigation` mock and two new failing tests to the test file**

Replace the top of `tests/components/SearchBox.test.tsx` so it reads:

```tsx
// tests/components/SearchBox.test.tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { SearchBox } from "@/components/SearchBox";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("SearchBox", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("debounces input and fetches /api/search", async () => {
    const calls: string[] = [];
    server.use(
      http.get("http://localhost/api/search", ({ request }) => {
        calls.push(new URL(request.url).searchParams.get("q") ?? "");
        return HttpResponse.json({ results: [{ id: 1, slug: "the-nose", name: "The Nose" }] });
      }),
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SearchBox />);
    const input = screen.getByRole("searchbox");

    await userEvent.type(input, "the");
    // No fetch yet — within debounce window
    expect(calls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(250);
    expect(calls.at(-1)).toBe("the");
    expect(await screen.findByText("The Nose")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("renders a result link to /route/:id", async () => {
    server.use(
      http.get("http://localhost/api/search", () =>
        HttpResponse.json({ results: [{ id: 42, slug: "x", name: "X Route" }] }),
      ),
    );
    render(<SearchBox />);
    await userEvent.type(screen.getByRole("searchbox"), "x");
    const link = await screen.findByRole("link", { name: /X Route/i });
    expect(link).toHaveAttribute("href", "/route/42");
  });

  it("navigates directly when a Mountain Project URL is pasted", async () => {
    const user = userEvent.setup();
    render(<SearchBox />);
    await user.click(screen.getByRole("searchbox"));
    await user.paste("https://www.mountainproject.com/route/105862922/the-nose");
    expect(mockPush).toHaveBeenCalledWith("/route/105862922");
  });

  it("does not call router.push for plain text queries", async () => {
    server.use(
      http.get("http://localhost/api/search", () =>
        HttpResponse.json({ results: [] }),
      ),
    );
    const user = userEvent.setup();
    render(<SearchBox />);
    await user.click(screen.getByRole("searchbox"));
    await user.paste("the nose");
    expect(mockPush).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the two new tests to confirm they fail**

```bash
npx vitest run tests/components/SearchBox.test.tsx
```

Expected: the two new tests FAIL (the existing two pass since `useRouter` mock is in place). You will see something like:
```
✓ debounces input and fetches /api/search
✓ renders a result link to /route/:id
✗ navigates directly when a Mountain Project URL is pasted
✗ does not call router.push for plain text queries
```

- [ ] **Step 3: Implement URL detection in `components/SearchBox.tsx`**

Replace the entire file content:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const MP_URL_RE = /mountainproject\.com\/route\/(\d+)/;

type Result = { id: number; slug: string; name: string; areaPath: string | null; grade: string | null };

export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);

  useEffect(() => {
    const match = MP_URL_RE.exec(q);
    if (match) {
      router.push(`/route/${match[1]}`);
      return;
    }
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

  return (
    <div className="searchbox">
      <input
        type="search"
        placeholder="Search a route…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search routes"
      />
      {results.length > 0 && (
        <ul role="listbox" className="searchbox-results">
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

- [ ] **Step 4: Run all SearchBox tests to confirm they all pass**

```bash
npx vitest run tests/components/SearchBox.test.tsx
```

Expected output:
```
✓ debounces input and fetches /api/search
✓ renders a result link to /route/:id
✓ navigates directly when a Mountain Project URL is pasted
✓ does not call router.push for plain text queries

Tests  4 passed (4)
```

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/SearchBox.tsx tests/components/SearchBox.test.tsx
git commit -m "feat: navigate directly when a Mountain Project URL is pasted into search"
```
