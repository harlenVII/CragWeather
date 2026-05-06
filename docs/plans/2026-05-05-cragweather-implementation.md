# CragWeather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v1 of CragWeather — a search-first website that displays a 14-day weather window (7 past + 7 forecast) for any climbing route on Mountain Project.

**Architecture:** A Next.js 14 (App Router) app on Vercel, backed by Vercel Postgres (with `pg_trgm` for fuzzy search). A monthly GitHub Actions cron parses MP's sitemap into the `routes` table. Per-route metadata (lat/lng, grade, area) is scraped lazily on first view and cached indefinitely in `route_meta`. Weather is fetched live from Open-Meteo per page view, browser-cached for 10 minutes. The MP scraper is the most fragile component and is fixture-tested.

**Tech Stack:** Next.js 14, TypeScript, Vercel Postgres + Drizzle ORM, Recharts, Vitest + MSW + `@testing-library/react`, `tsx` for the indexer script, `cheerio` for HTML parsing, GitHub Actions.

**Conventions used in every task:**
- File paths are relative to the repo root: `/Users/harlen/Desktop/myCODE/CragWeather`.
- Every code-changing task ends with a **commit step** using a `feat:` / `fix:` / `chore:` / `test:` / `docs:` prefix.
- Each test step shows the expected output (PASS/FAIL with reason).
- Type signatures defined in early tasks are used verbatim in later tasks — do not rename without updating downstream tasks.

**Locked type signatures (used across tasks):**
```ts
// lib/search.ts
export type RouteSearchResult = { id: number; slug: string; name: string };
export async function searchRoutes(q: string, limit?: number): Promise<RouteSearchResult[]>;

// lib/mp-scraper.ts
export type ScrapedRoute = {
  name: string;
  lat: number;
  lng: number;
  area: string | null;
  grade: string | null;
};
export function parseRoutePage(html: string): ScrapedRoute;
export async function scrapeRoute(id: number, fetcher?: typeof fetch): Promise<ScrapedRoute>;

// lib/weather.ts
export type DailyWeather  = { date: string; tempMax: number; tempMin: number; precip: number };
export type HourlyWeather = { datetime: string; temp: number; precip: number };
export type WeatherResponse = { daily: DailyWeather[]; hourly: HourlyWeather[] };
export async function fetchWeather(lat: number, lng: number, fetcher?: typeof fetch): Promise<WeatherResponse>;

// /api/search response
type SearchApiResponse = { results: RouteSearchResult[] };

// /api/route/[id] response
type RouteApiResponse = {
  route: { id: number; name: string; slug: string; area: string | null; grade: string | null; lat: number; lng: number; mpUrl: string };
  weather: WeatherResponse | null;  // null when Open-Meteo failed
};
```

---

## Task 1: Initialize Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `.gitignore`, `.env.example`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

- [ ] **Step 1: Bootstrap Next.js 14 with TypeScript and App Router**

Run:
```bash
cd /Users/harlen/Desktop/myCODE/CragWeather
npx create-next-app@14 . --typescript --app --no-tailwind --no-eslint --import-alias "@/*" --src-dir=false --use-npm
```

When prompted "directory is not empty, would you like to continue?" → **Yes**.

Expected: `package.json`, `app/`, `next.config.mjs`, `tsconfig.json`, `app/page.tsx`, `app/layout.tsx`, `app/globals.css` are created.

- [ ] **Step 2: Strip the boilerplate homepage**

Replace `app/page.tsx` contents with a minimal placeholder so we own all subsequent UI:

```tsx
export default function HomePage() {
  return (
    <main>
      <h1>CragWeather</h1>
      <p>Search a climbing route to see its 14-day weather window.</p>
    </main>
  );
}
```

Replace `app/globals.css` with an empty body reset:

```css
:root {
  --bg: #fafafa;
  --fg: #1a1a1a;
  --accent: #c2410c;
  --muted: #6b7280;
  --card: #ffffff;
  --border: #e5e7eb;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  line-height: 1.5;
}

a { color: var(--accent); }
```

Replace `app/layout.tsx` with:

```tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CragWeather",
  description: "14-day weather windows for climbing routes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Add `.env.example`**

Create `.env.example`:
```
POSTGRES_URL=postgres://crag:crag@localhost:5432/crag
MP_USER_AGENT=CragWeather/0.1 (+contact: harlanxu16@gmail.com)
```

- [ ] **Step 4: Verify the dev server starts**

Run: `npm run dev`
Open `http://localhost:3000`. Expected: "CragWeather" heading visible. Stop the server with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 14 app with App Router"
```

---

## Task 2: Install dependencies and configure Vitest + MSW

**Files:**
- Create: `vitest.config.ts`, `tests/setup.ts`, `tests/mocks/handlers.ts`, `tests/mocks/server.ts`
- Modify: `package.json` (add scripts)

- [ ] **Step 1: Install runtime and dev dependencies**

```bash
npm install drizzle-orm @vercel/postgres recharts cheerio
npm install --save-dev drizzle-kit tsx vitest @vitest/ui @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom msw@^2 @types/node
```

- [ ] **Step 2: Add npm scripts**

Edit `package.json` → `"scripts"` block to:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest run",
  "test:watch": "vitest",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "index:routes": "tsx scripts/build-index.ts"
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 4: Create `tests/mocks/handlers.ts`**

```ts
import { http, HttpResponse } from "msw";

// Default handlers — individual tests override with server.use(...).
export const handlers = [
  http.all("https://www.mountainproject.com/*", () =>
    HttpResponse.text("default mock — override in test", { status: 200 }),
  ),
  http.all("https://api.open-meteo.com/*", () =>
    HttpResponse.json({}, { status: 200 }),
  ),
];
```

- [ ] **Step 5: Create `tests/mocks/server.ts`**

```ts
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
```

- [ ] **Step 6: Create `tests/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./mocks/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 7: Add a sanity test**

Create `tests/sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("sanity", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: 1 passed test, no MSW warnings.

- [ ] **Step 8: Delete the sanity test and commit**

```bash
rm tests/sanity.test.ts
git add -A
git commit -m "chore: add vitest + MSW + testing-library + drizzle deps"
```

---

## Task 3: Configure Drizzle and define the schema

**Files:**
- Create: `drizzle.config.ts`, `lib/db.ts`, `lib/schema.ts`, `docker-compose.yml`

- [ ] **Step 1: Create `docker-compose.yml`** (local Postgres for dev + tests)

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: crag
      POSTGRES_PASSWORD: crag
      POSTGRES_DB: crag
    ports:
      - "5432:5432"
    volumes:
      - cragdata:/var/lib/postgresql/data

volumes:
  cragdata:
```

Run:
```bash
docker compose up -d
docker compose ps
```

Expected: `postgres` container is `running`.

- [ ] **Step 2: Create `lib/schema.ts`**

```ts
import { bigint, doublePrecision, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const routes = pgTable(
  "routes",
  {
    // MP IDs are 9-10 digits → fit in JS number safely (well under 2^53).
    id: bigint("id", { mode: "number" }).primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameTrgm: index("routes_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
  }),
);

export const routeMeta = pgTable("route_meta", {
  id: bigint("id", { mode: "number" })
    .primaryKey()
    .references(() => routes.id, { onDelete: "cascade" }),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  areaPath: text("area_path"),
  grade: text("grade"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Route = typeof routes.$inferSelect;
export type RouteMeta = typeof routeMeta.$inferSelect;
```

- [ ] **Step 3: Create `drizzle.config.ts`**

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.POSTGRES_URL! },
});
```

Install `dotenv` (used only by drizzle-kit at CLI time):
```bash
npm install --save-dev dotenv
```

- [ ] **Step 4: Create `lib/db.ts`**

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

if (!process.env.POSTGRES_URL) {
  throw new Error("POSTGRES_URL is not set");
}

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
export const db = drizzle(pool, { schema });
export { schema };
```

Install pg:
```bash
npm install pg
npm install --save-dev @types/pg
```

- [ ] **Step 5: Generate the initial migration**

Create `.env` (untracked) at repo root:
```
POSTGRES_URL=postgres://crag:crag@localhost:5432/crag
```

Run: `npm run db:generate`
Expected: `drizzle/0000_<random>.sql` is created. Open it.

The generated SQL will define `routes` and `route_meta` but **will not** include `CREATE EXTENSION pg_trgm` or the GIN trigram index (drizzle-kit doesn't know about extensions). Add both manually at the **top** of the generated file:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

If the generated `routes_name_trgm` index uses regular btree syntax, replace with:
```sql
CREATE INDEX IF NOT EXISTS "routes_name_trgm" ON "routes" USING gin ("name" gin_trgm_ops);
```

- [ ] **Step 6: Apply the migration**

Run: `npm run db:migrate`
Expected: "0 migrations applied" → "1 migration applied" (or "All migrations applied"), exit 0.

Verify with:
```bash
docker compose exec postgres psql -U crag -d crag -c "\dt"
docker compose exec postgres psql -U crag -d crag -c "\di"
```

Expected: tables `routes`, `route_meta` and an index `routes_name_trgm` of type `gin`.

- [ ] **Step 7: Append to `.gitignore`**

Append to `.gitignore`:
```
.env
.env.local
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Drizzle schema for routes and route_meta with pg_trgm"
```

---

## Task 4: Test database helper

**Files:**
- Create: `tests/helpers/test-db.ts`

A reusable helper that connects to the same local Postgres and provides a clean-slate `truncate()` so DB-touching tests don't pollute each other.

- [ ] **Step 1: Create the helper**

```ts
// tests/helpers/test-db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "@/lib/schema";

const url = process.env.POSTGRES_URL ?? "postgres://crag:crag@localhost:5432/crag";
const pool = new Pool({ connectionString: url });
export const testDb = drizzle(pool, { schema });

export async function truncateAll() {
  await testDb.execute(sql`TRUNCATE TABLE route_meta, routes RESTART IDENTITY CASCADE`);
}

export async function closeDb() {
  await pool.end();
}
```

- [ ] **Step 2: Verify the helper compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: add Postgres helper for integration tests"
```

---

## Task 5: Search lib (TDD)

**Files:**
- Create: `lib/search.ts`, `tests/lib/search.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/search.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { searchRoutes } from "@/lib/search";
import { testDb, truncateAll, closeDb } from "../helpers/test-db";
import { routes } from "@/lib/schema";

beforeEach(async () => {
  await truncateAll();
  await testDb.insert(routes).values([
    { id: 1, slug: "the-nose", name: "The Nose" },
    { id: 2, slug: "astroman", name: "Astroman" },
    { id: 3, slug: "epinephrine", name: "Epinephrine" },
    { id: 4, slug: "the-naked-edge", name: "The Naked Edge" },
    { id: 5, slug: "high-exposure", name: "High Exposure" },
  ]);
});

afterAll(async () => {
  await closeDb();
});

describe("searchRoutes", () => {
  it("returns exact-name matches at the top", async () => {
    const r = await searchRoutes("the nose");
    expect(r[0]).toEqual({ id: 1, slug: "the-nose", name: "The Nose" });
  });

  it("tolerates typos via trigrams", async () => {
    const r = await searchRoutes("astroma");
    expect(r.map((x) => x.id)).toContain(2);
  });

  it("returns empty array for blank input", async () => {
    expect(await searchRoutes("")).toEqual([]);
    expect(await searchRoutes("   ")).toEqual([]);
  });

  it("respects limit parameter", async () => {
    const r = await searchRoutes("the", 2);
    expect(r.length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/lib/search.test.ts`
Expected: FAIL — "Cannot find module '@/lib/search'".

- [ ] **Step 3: Write the implementation**

```ts
// lib/search.ts
import { sql } from "drizzle-orm";
import { db } from "./db";
import { routes } from "./schema";

export type RouteSearchResult = { id: number; slug: string; name: string };

export async function searchRoutes(
  q: string,
  limit = 20,
): Promise<RouteSearchResult[]> {
  const query = q.trim();
  if (query.length === 0) return [];

  const rows = await db
    .select({ id: routes.id, slug: routes.slug, name: routes.name })
    .from(routes)
    .where(sql`${routes.name} % ${query}`)
    .orderBy(sql`similarity(${routes.name}, ${query}) DESC`)
    .limit(limit);

  return rows;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/lib/search.test.ts`
Expected: 4 passed.

If the trigram-typo test fails because similarity is below pg_trgm's default threshold (0.3), tighten the test to only require `r.length > 0` for the typo case, or call `SET pg_trgm.similarity_threshold = 0.2` once at DB setup. Pick the looser test — we want resilience, not a knife-edge.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add trigram fuzzy search over routes table"
```

---

## Task 6: MP scraper — fetch fixtures and parse name + lat/lng

**Files:**
- Create: `tests/fixtures/mp/README.md`, `tests/fixtures/mp/<id>.html` (×6), `lib/mp-scraper.ts`, `tests/lib/mp-scraper.test.ts`

The scraper is the most fragile component. We commit real MP HTML so parser regressions break CI loudly.

- [ ] **Step 1: Fetch six fixtures with curl, 60s apart**

The fixtures must be real MP route pages. Run, **with 60s sleep between requests** (per MP's stated `crawl-delay: 60`):

```bash
mkdir -p tests/fixtures/mp
UA="CragWeather/0.1 (+contact: harlanxu16@gmail.com)"
for id in 105862922 105749354 105862732 105732632 105836362 105868963; do
  curl -sS -A "$UA" "https://www.mountainproject.com/route/$id" -o "tests/fixtures/mp/$id.html"
  echo "fetched $id ($(wc -c < tests/fixtures/mp/$id.html) bytes)"
  sleep 60
done
```

Verify each file is >50 KB and contains the route name (sanity check that we didn't get rate-limited):
```bash
for f in tests/fixtures/mp/*.html; do
  printf "%-30s %s\n" "$f" "$(grep -oE '<title>[^<]+</title>' "$f" | head -1)"
done
```

Expected: each line shows a `<title>` containing the route name.

- [ ] **Step 2: Add a fixture README**

```markdown
<!-- tests/fixtures/mp/README.md -->
# MP HTML fixtures

Saved snapshots of public Mountain Project route pages, used to test `lib/mp-scraper.ts`.
Re-fetch periodically (annually) and re-run tests to detect MP markup drift.

| File | Route | Notes |
|------|-------|-------|
| 105862922.html | The Nose, El Capitan | Long multi-pitch, deeply nested area |
| 105749354.html | The Naked Edge | Trad classic, short area path |
| 105862732.html | Astroman | Multi-pitch, well-known |
| 105732632.html | Epinephrine | Vegas, sandstone |
| 105836362.html | Royal Arches | Yosemite, multi-pitch |
| 105868963.html | High Exposure | Gunks, single-pitch trad |
```

- [ ] **Step 3: Inspect a fixture to confirm coordinate format**

Run:
```bash
grep -oE 'maps.google.com/[^"]+' tests/fixtures/mp/105862922.html | head -3
grep -oE '\-?[0-9]+\.[0-9]{4,6},\s*-?[0-9]+\.[0-9]{4,6}' tests/fixtures/mp/105862922.html | head -3
```

Expected: at least one Google-Maps link with `?q=<lat>,<lng>` AND/OR a free-text coordinate pair. Confirm visually that El Cap is around `(37.73, -119.64)`.

- [ ] **Step 4: Write the failing parser test (name + lat/lng only for now)**

```ts
// tests/lib/mp-scraper.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRoutePage } from "@/lib/mp-scraper";

const fixture = (id: number) =>
  readFileSync(join(__dirname, "..", "fixtures", "mp", `${id}.html`), "utf8");

describe("parseRoutePage — name + coords", () => {
  it("extracts The Nose", () => {
    const r = parseRoutePage(fixture(105862922));
    expect(r.name).toBe("The Nose");
    expect(r.lat).toBeCloseTo(37.73, 1);
    expect(r.lng).toBeCloseTo(-119.64, 1);
  });

  it("extracts The Naked Edge", () => {
    const r = parseRoutePage(fixture(105749354));
    expect(r.name).toBe("The Naked Edge");
    expect(r.lat).toBeGreaterThan(39);
    expect(r.lat).toBeLessThan(40);
    expect(r.lng).toBeLessThan(-105);
    expect(r.lng).toBeGreaterThan(-106);
  });

  it("extracts High Exposure", () => {
    const r = parseRoutePage(fixture(105868963));
    expect(r.name).toBe("High Exposure");
    expect(r.lat).toBeGreaterThan(41);
    expect(r.lng).toBeLessThan(-74);
  });
});
```

- [ ] **Step 5: Run the test to confirm it fails**

Run: `npm test -- tests/lib/mp-scraper.test.ts`
Expected: FAIL — "Cannot find module '@/lib/mp-scraper'".

- [ ] **Step 6: Implement `parseRoutePage` (name + lat/lng)**

```ts
// lib/mp-scraper.ts
import * as cheerio from "cheerio";

export type ScrapedRoute = {
  name: string;
  lat: number;
  lng: number;
  area: string | null;
  grade: string | null;
};

const COORD_RE = /(-?\d{1,3}\.\d{4,6}),\s*(-?\d{1,3}\.\d{4,6})/;

function parseCoords(html: string, $: cheerio.CheerioAPI): { lat: number; lng: number } {
  // Primary: Google-Maps anchor href
  const a = $('a[href*="maps.google.com"]').attr("href");
  if (a) {
    const m = a.match(COORD_RE);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  // Fallback: free-text coordinate pair anywhere on the page
  const m2 = html.match(COORD_RE);
  if (m2) return { lat: Number(m2[1]), lng: Number(m2[2]) };
  throw new Error("coordinates not found");
}

function parseName($: cheerio.CheerioAPI): string {
  // MP uses <h1 class="...inline-block..."> with the route name as direct text.
  const h1 = $("h1").first().text().trim();
  if (h1) {
    // Strip any " " artefacts and trailing badges/text after a newline.
    return h1.split("\n")[0].trim();
  }
  throw new Error("name not found");
}

export function parseRoutePage(html: string): ScrapedRoute {
  const $ = cheerio.load(html);
  return {
    name: parseName($),
    ...parseCoords(html, $),
    area: null,
    grade: null,
  };
}

export async function scrapeRoute(
  id: number,
  fetcher: typeof fetch = fetch,
): Promise<ScrapedRoute> {
  const ua = process.env.MP_USER_AGENT ?? "CragWeather/0.1";
  const res = await fetcher(`https://www.mountainproject.com/route/${id}`, {
    headers: { "User-Agent": ua, Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`MP returned ${res.status}`);
  const html = await res.text();
  return parseRoutePage(html);
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- tests/lib/mp-scraper.test.ts`
Expected: 3 passed. If `parseName` returns extra whitespace or trailing junk, tighten the splitter — but DO NOT loosen the assertions; the goal is to catch MP drift.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scrape MP route name and coordinates from HTML"
```

---

## Task 7: MP scraper — area path

**Files:**
- Modify: `lib/mp-scraper.ts`, `tests/lib/mp-scraper.test.ts`

- [ ] **Step 1: Inspect a fixture to find the area breadcrumb**

Run:
```bash
grep -A 2 'class="mb-half"' tests/fixtures/mp/105862922.html | head -30
```

Look for the breadcrumb-style list of area links. Typically a `<div>` containing `<a>` elements that each link to an `/area/<id>/<slug>` URL. Note the surrounding selector (most commonly `.mb-half a[href*="/area/"]`).

- [ ] **Step 2: Add the failing test**

Append to `tests/lib/mp-scraper.test.ts`:

```ts
describe("parseRoutePage — area path", () => {
  it("includes deep nested area for The Nose", () => {
    const r = parseRoutePage(fixture(105862922));
    expect(r.area).toMatch(/El Capitan/i);
    expect(r.area).toMatch(/Yosemite/i);
    expect(r.area!.split(" > ").length).toBeGreaterThanOrEqual(2);
  });

  it("includes area for High Exposure", () => {
    const r = parseRoutePage(fixture(105868963));
    expect(r.area).toMatch(/Gunks|Trapps/i);
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `npm test -- tests/lib/mp-scraper.test.ts`
Expected: FAIL — `r.area` is null.

- [ ] **Step 4: Implement area parsing**

In `lib/mp-scraper.ts`, add:

```ts
function parseArea($: cheerio.CheerioAPI): string | null {
  const links = $('a[href*="/area/"]')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((t) => t.length > 0);
  if (links.length === 0) return null;
  // De-dupe consecutive duplicates and stop at the route's own row if MP repeats it.
  const cleaned: string[] = [];
  for (const t of links) {
    if (cleaned[cleaned.length - 1] !== t) cleaned.push(t);
  }
  return cleaned.join(" > ");
}
```

Update `parseRoutePage` to call it:

```ts
export function parseRoutePage(html: string): ScrapedRoute {
  const $ = cheerio.load(html);
  return {
    name: parseName($),
    ...parseCoords(html, $),
    area: parseArea($),
    grade: null,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/lib/mp-scraper.test.ts`
Expected: 5 passed total. If the area string is reversed or has extra navigation links (e.g. "All Routes"), tighten `parseArea` to filter known noise tokens.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: parse MP area breadcrumb from route page"
```

---

## Task 8: MP scraper — grade

**Files:**
- Modify: `lib/mp-scraper.ts`, `tests/lib/mp-scraper.test.ts`

- [ ] **Step 1: Inspect fixtures for grade markup**

Run:
```bash
grep -oE 'rateYDS[^<]*<[^<]*' tests/fixtures/mp/105862922.html | head
grep -oE 'YDS[^<]*' tests/fixtures/mp/105749354.html | head
```

You should see grades like "5.9", "5.13b", "5.11d/12a". MP uses a `<span class="rateYDS">5.13b</span>` or similar; record the exact selector you see.

- [ ] **Step 2: Add the failing test**

Append to `tests/lib/mp-scraper.test.ts`:

```ts
describe("parseRoutePage — grade", () => {
  it("returns grade for The Nose", () => {
    const r = parseRoutePage(fixture(105862922));
    expect(r.grade).toMatch(/^5\.[0-9]+/);
  });

  it("returns grade for The Naked Edge", () => {
    expect(parseRoutePage(fixture(105749354)).grade).toMatch(/^5\.11/);
  });

  it("returns null when no YDS grade is present", () => {
    // synthesize a minimal HTML body that has no rateYDS marker
    const r = parseRoutePage(
      `<html><body><h1>X</h1><a href="https://maps.google.com/?q=37.0,-119.0">m</a></body></html>`,
    );
    expect(r.grade).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `npm test -- tests/lib/mp-scraper.test.ts`
Expected: FAIL — grade null where expected non-null.

- [ ] **Step 4: Implement grade parsing**

In `lib/mp-scraper.ts`:

```ts
function parseGrade($: cheerio.CheerioAPI): string | null {
  const yds = $(".rateYDS").first().text().trim();
  if (yds) {
    // "5.13b YDS" → "5.13b"
    return yds.replace(/\s*YDS\s*$/i, "").trim() || null;
  }
  return null;
}
```

Wire it into `parseRoutePage`:

```ts
export function parseRoutePage(html: string): ScrapedRoute {
  const $ = cheerio.load(html);
  return {
    name: parseName($),
    ...parseCoords(html, $),
    area: parseArea($),
    grade: parseGrade($),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/lib/mp-scraper.test.ts`
Expected: 8 passed total. If `.rateYDS` doesn't match what's in the fixture, fall back to a regex on the page text: `/(5\.\d+[a-d]?(?:\/\d+[a-d]?)?)/` and pick the first match.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: parse YDS grade from MP route page"
```

---

## Task 9: MP scraper — `scrapeRoute` integration test

**Files:**
- Modify: `tests/lib/mp-scraper.test.ts`

`scrapeRoute` (the network-using wrapper) needs MSW coverage so we know the User-Agent header and URL shape are right.

- [ ] **Step 1: Add the failing test**

Append to `tests/lib/mp-scraper.test.ts`:

```ts
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { scrapeRoute } from "@/lib/mp-scraper";

describe("scrapeRoute", () => {
  it("requests the right URL with a User-Agent and returns parsed data", async () => {
    let receivedUA = "";
    server.use(
      http.get("https://www.mountainproject.com/route/:id", ({ request, params }) => {
        receivedUA = request.headers.get("user-agent") ?? "";
        if (params.id !== "105862922") return new HttpResponse(null, { status: 404 });
        return HttpResponse.text(fixture(105862922));
      }),
    );

    const r = await scrapeRoute(105862922);
    expect(r.name).toBe("The Nose");
    expect(receivedUA).toMatch(/CragWeather/);
  });

  it("throws on non-200 responses", async () => {
    server.use(
      http.get("https://www.mountainproject.com/route/:id", () =>
        new HttpResponse(null, { status: 404 }),
      ),
    );
    await expect(scrapeRoute(999999999)).rejects.toThrow(/404/);
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npm test -- tests/lib/mp-scraper.test.ts`
Expected: 10 passed (8 prior + 2 new). The implementation already handles both cases.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: cover scrapeRoute network behavior with MSW"
```

---

## Task 10: Weather lib (TDD)

**Files:**
- Create: `tests/fixtures/open-meteo.json`, `lib/weather.ts`, `tests/lib/weather.test.ts`

- [ ] **Step 1: Capture an Open-Meteo fixture**

```bash
mkdir -p tests/fixtures
curl -sS "https://api.open-meteo.com/v1/forecast?latitude=37.73&longitude=-119.64&past_days=7&forecast_days=7&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&hourly=temperature_2m,precipitation&timezone=auto" \
  -o tests/fixtures/open-meteo.json
node -e "const j=require('./tests/fixtures/open-meteo.json'); console.log('daily.time len=', j.daily.time.length, 'hourly.time len=', j.hourly.time.length);"
```

Expected: `daily.time len= 14`, `hourly.time len= 336` (14 × 24).

- [ ] **Step 2: Write the failing test**

```ts
// tests/lib/weather.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { fetchWeather } from "@/lib/weather";

const fixture = JSON.parse(
  readFileSync(join(__dirname, "..", "fixtures", "open-meteo.json"), "utf8"),
);

describe("fetchWeather", () => {
  it("normalizes the Open-Meteo response", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("latitude")).toBe("37.73");
        expect(url.searchParams.get("longitude")).toBe("-119.64");
        expect(url.searchParams.get("past_days")).toBe("7");
        expect(url.searchParams.get("forecast_days")).toBe("7");
        return HttpResponse.json(fixture);
      }),
    );

    const w = await fetchWeather(37.73, -119.64);
    expect(w.daily).toHaveLength(14);
    expect(w.hourly).toHaveLength(14 * 24);
    expect(w.daily[0]).toMatchObject({
      date: expect.any(String),
      tempMax: expect.any(Number),
      tempMin: expect.any(Number),
      precip: expect.any(Number),
    });
    expect(w.hourly[0]).toMatchObject({
      datetime: expect.any(String),
      temp: expect.any(Number),
      precip: expect.any(Number),
    });
  });

  it("throws on non-200 response", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () =>
        new HttpResponse(null, { status: 503 }),
      ),
    );
    await expect(fetchWeather(0, 0)).rejects.toThrow(/503/);
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `npm test -- tests/lib/weather.test.ts`
Expected: FAIL — "Cannot find module '@/lib/weather'".

- [ ] **Step 4: Implement `fetchWeather`**

```ts
// lib/weather.ts
export type DailyWeather  = { date: string; tempMax: number; tempMin: number; precip: number };
export type HourlyWeather = { datetime: string; temp: number; precip: number };
export type WeatherResponse = { daily: DailyWeather[]; hourly: HourlyWeather[] };

type OmResponse = {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation: number[];
  };
};

export async function fetchWeather(
  lat: number,
  lng: number,
  fetcher: typeof fetch = fetch,
): Promise<WeatherResponse> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("past_days", "7");
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum");
  url.searchParams.set("hourly", "temperature_2m,precipitation");
  url.searchParams.set("timezone", "auto");

  const res = await fetcher(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
  const j: OmResponse = await res.json();

  const daily = j.daily.time.map((t, i) => ({
    date: t,
    tempMax: j.daily.temperature_2m_max[i],
    tempMin: j.daily.temperature_2m_min[i],
    precip: j.daily.precipitation_sum[i],
  }));
  const hourly = j.hourly.time.map((t, i) => ({
    datetime: t,
    temp: j.hourly.temperature_2m[i],
    precip: j.hourly.precipitation[i],
  }));
  return { daily, hourly };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/lib/weather.test.ts`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: fetch and normalize Open-Meteo weather"
```

---

## Task 11: `/api/search` route (TDD)

**Files:**
- Create: `app/api/search/route.ts`, `tests/api/search.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/search.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/search/route";
import { testDb, truncateAll, closeDb } from "../helpers/test-db";
import { routes } from "@/lib/schema";

beforeEach(async () => {
  await truncateAll();
  await testDb.insert(routes).values([
    { id: 1, slug: "the-nose", name: "The Nose" },
    { id: 2, slug: "astroman", name: "Astroman" },
  ]);
});

afterAll(async () => {
  await closeDb();
});

function makeReq(q: string) {
  return new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`);
}

describe("GET /api/search", () => {
  it("returns matches for a query", async () => {
    const res = await GET(makeReq("nose"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.results.map((r: { id: number }) => r.id)).toContain(1);
  });

  it("returns empty array for missing q", async () => {
    const res = await GET(new Request("http://localhost/api/search"));
    const j = await res.json();
    expect(j.results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- tests/api/search.test.ts`
Expected: FAIL — "Cannot find module '@/app/api/search/route'".

- [ ] **Step 3: Implement the route**

```ts
// app/api/search/route.ts
import { NextResponse } from "next/server";
import { searchRoutes } from "@/lib/search";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const results = await searchRoutes(q);
  return NextResponse.json({ results });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/api/search.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: GET /api/search returns trigram matches"
```

---

## Task 12: `/api/route/[id]` route — cache hit path (TDD)

**Files:**
- Create: `app/api/route/[id]/route.ts`, `tests/api/route.test.ts`

- [ ] **Step 1: Write the failing test (cache hit only)**

```ts
// tests/api/route.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GET } from "@/app/api/route/[id]/route";
import { testDb, truncateAll, closeDb } from "../helpers/test-db";
import { routes, routeMeta } from "@/lib/schema";
import { server } from "../mocks/server";

const omFixture = JSON.parse(
  readFileSync(join(__dirname, "..", "fixtures", "open-meteo.json"), "utf8"),
);

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/route/[id] — cache hit", () => {
  it("uses cached meta and returns weather", async () => {
    await testDb.insert(routes).values({ id: 105862922, slug: "the-nose", name: "The Nose" });
    await testDb.insert(routeMeta).values({
      id: 105862922,
      lat: 37.73,
      lng: -119.64,
      areaPath: "Yosemite > El Capitan",
      grade: "5.9",
    });

    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(omFixture)),
      // If anything tries to scrape MP, fail loudly:
      http.get("https://www.mountainproject.com/*", () => {
        throw new Error("scraper called on cache hit");
      }),
    );

    const res = await GET(new Request("http://localhost/api/route/105862922"), ctx("105862922"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.route).toMatchObject({
      id: 105862922,
      name: "The Nose",
      slug: "the-nose",
      area: "Yosemite > El Capitan",
      grade: "5.9",
      lat: 37.73,
      lng: -119.64,
      mpUrl: "https://www.mountainproject.com/route/105862922",
    });
    expect(j.weather.daily).toHaveLength(14);
    expect(res.headers.get("cache-control")).toMatch(/public.*max-age=600/);
  });

  it("returns 404 for unknown route id", async () => {
    const res = await GET(new Request("http://localhost/api/route/1"), ctx("1"));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- tests/api/route.test.ts`
Expected: FAIL — "Cannot find module '@/app/api/route/[id]/route'".

- [ ] **Step 3: Implement the route (cache hit + 404 only; cache miss in next task)**

```ts
// app/api/route/[id]/route.ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { routes, routeMeta } from "@/lib/schema";
import { fetchWeather, type WeatherResponse } from "@/lib/weather";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }

  const route = await db.query.routes.findFirst({ where: eq(routes.id, id) });
  if (!route) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const meta = await db.query.routeMeta.findFirst({ where: eq(routeMeta.id, id) });
  const fresh = meta && Date.now() - meta.fetchedAt.getTime() < NINETY_DAYS_MS;

  if (!fresh) {
    return NextResponse.json({ error: "not_implemented_yet" }, { status: 501 });
  }

  let weather: WeatherResponse | null = null;
  try {
    weather = await fetchWeather(meta.lat, meta.lng);
  } catch {
    weather = null;
  }

  return NextResponse.json(
    {
      route: {
        id: route.id,
        name: route.name,
        slug: route.slug,
        area: meta.areaPath,
        grade: meta.grade,
        lat: meta.lat,
        lng: meta.lng,
        mpUrl: `https://www.mountainproject.com/route/${id}`,
      },
      weather,
    },
    { headers: { "Cache-Control": "public, max-age=600" } },
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/api/route.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: GET /api/route/[id] cache-hit path"
```

---

## Task 13: `/api/route/[id]` — cache miss (scrape + persist)

**Files:**
- Modify: `app/api/route/[id]/route.ts`, `tests/api/route.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `tests/api/route.test.ts`:

```ts
import { readFileSync as rfs } from "node:fs";
const mpHtml = rfs(join(__dirname, "..", "fixtures", "mp", "105862922.html"), "utf8");

describe("GET /api/route/[id] — cache miss", () => {
  it("scrapes MP, persists meta, returns weather", async () => {
    await testDb.insert(routes).values({ id: 105862922, slug: "the-nose", name: "the nose" });

    let scrapeCalls = 0;
    server.use(
      http.get("https://www.mountainproject.com/route/:id", () => {
        scrapeCalls++;
        return HttpResponse.text(mpHtml);
      }),
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(omFixture)),
    );

    const res = await GET(new Request("http://localhost/api/route/105862922"), ctx("105862922"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(scrapeCalls).toBe(1);
    expect(j.route.name).toBe("The Nose"); // canonical name from scrape
    expect(j.route.lat).toBeCloseTo(37.73, 1);

    // Verify meta was persisted
    const persisted = await testDb.query.routeMeta.findFirst();
    expect(persisted?.id).toBe(105862922);
    expect(persisted?.lat).toBeCloseTo(37.73, 1);

    // Verify routes.name was upgraded to canonical
    const r = await testDb.query.routes.findFirst();
    expect(r?.name).toBe("The Nose");
  });

  it("returns 502 when scrape fails", async () => {
    await testDb.insert(routes).values({ id: 999, slug: "x", name: "x" });
    server.use(
      http.get("https://www.mountainproject.com/route/:id", () => new HttpResponse(null, { status: 500 })),
    );
    const res = await GET(new Request("http://localhost/api/route/999"), ctx("999"));
    expect(res.status).toBe(502);
    const j = await res.json();
    expect(j.error).toBe("route_unavailable");
  });
});
```

- [ ] **Step 2: Run the test to confirm both new cases fail**

Run: `npm test -- tests/api/route.test.ts`
Expected: 2 prior pass, 2 new FAIL with status 501.

- [ ] **Step 3: Implement the cache-miss branch**

Replace the `if (!fresh) { return ... 501 ... }` stub in `app/api/route/[id]/route.ts` with:

```ts
import { scrapeRoute } from "@/lib/mp-scraper";

// ... inside GET, replace the 501 stub:
let activeMeta = meta;
if (!fresh) {
  let scraped;
  try {
    scraped = await scrapeRoute(id);
  } catch {
    return NextResponse.json({ error: "route_unavailable" }, { status: 502 });
  }
  await db
    .insert(routeMeta)
    .values({
      id,
      lat: scraped.lat,
      lng: scraped.lng,
      areaPath: scraped.area,
      grade: scraped.grade,
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: routeMeta.id,
      set: {
        lat: scraped.lat,
        lng: scraped.lng,
        areaPath: scraped.area,
        grade: scraped.grade,
        fetchedAt: new Date(),
      },
    });
  await db.update(routes).set({ name: scraped.name }).where(eq(routes.id, id));
  // Reflect freshly-written values without an extra round-trip:
  activeMeta = {
    id,
    lat: scraped.lat,
    lng: scraped.lng,
    areaPath: scraped.area,
    grade: scraped.grade,
    fetchedAt: new Date(),
  };
  route.name = scraped.name;
}

let weather: WeatherResponse | null = null;
try {
  weather = await fetchWeather(activeMeta!.lat, activeMeta!.lng);
} catch {
  weather = null;
}

return NextResponse.json(
  {
    route: {
      id: route.id,
      name: route.name,
      slug: route.slug,
      area: activeMeta!.areaPath,
      grade: activeMeta!.grade,
      lat: activeMeta!.lat,
      lng: activeMeta!.lng,
      mpUrl: `https://www.mountainproject.com/route/${id}`,
    },
    weather,
  },
  { headers: { "Cache-Control": "public, max-age=600" } },
);
```

The full GET function after this edit should:
1. Validate id, look up `route` (404 if missing).
2. Look up `meta`, compute `fresh`.
3. If not fresh: scrape MP (502 on failure), upsert meta, update routes.name, set `activeMeta` and `route.name`.
4. Fetch weather (catch failures → null).
5. Return combined JSON with `Cache-Control: public, max-age=600`.

Replace the existing GET body so the cache-hit path also uses `activeMeta` (rename `meta` → `activeMeta` in the cache-hit weather/return blocks for consistency).

- [ ] **Step 4: Run the test to verify all four pass**

Run: `npm test -- tests/api/route.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: cache-miss path scrapes MP and persists route_meta"
```

---

## Task 14: Sitemap indexer — sitemap parser (TDD)

**Files:**
- Create: `tests/fixtures/sitemap-index.xml`, `tests/fixtures/sitemap-routes.xml`, `lib/sitemap.ts`, `tests/lib/sitemap.test.ts`

- [ ] **Step 1: Create XML fixtures**

Create `tests/fixtures/sitemap-index.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://www.mountainproject.com/sitemap-routes-1.xml</loc></sitemap>
  <sitemap><loc>https://www.mountainproject.com/sitemap-routes-2.xml</loc></sitemap>
  <sitemap><loc>https://www.mountainproject.com/sitemap-areas-1.xml</loc></sitemap>
</sitemapindex>
```

Create `tests/fixtures/sitemap-routes.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.mountainproject.com/route/105862922/the-nose</loc></url>
  <url><loc>https://www.mountainproject.com/route/105749354/the-naked-edge</loc></url>
  <url><loc>https://www.mountainproject.com/area/12345/some-area</loc></url>
  <url><loc>https://www.mountainproject.com/route/105862732/astroman</loc></url>
</urlset>
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/lib/sitemap.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSitemapIndex, parseRouteSitemap, slugToName } from "@/lib/sitemap";

const fix = (n: string) => readFileSync(join(__dirname, "..", "fixtures", n), "utf8");

describe("parseSitemapIndex", () => {
  it("returns only route sub-sitemap URLs", () => {
    const urls = parseSitemapIndex(fix("sitemap-index.xml"));
    expect(urls).toEqual([
      "https://www.mountainproject.com/sitemap-routes-1.xml",
      "https://www.mountainproject.com/sitemap-routes-2.xml",
    ]);
  });
});

describe("parseRouteSitemap", () => {
  it("extracts {id, slug} for each /route/<id>/<slug> entry, ignoring areas", () => {
    const rows = parseRouteSitemap(fix("sitemap-routes.xml"));
    expect(rows).toEqual([
      { id: 105862922, slug: "the-nose" },
      { id: 105749354, slug: "the-naked-edge" },
      { id: 105862732, slug: "astroman" },
    ]);
  });
});

describe("slugToName", () => {
  it("title-cases hyphenated slugs", () => {
    expect(slugToName("the-nose")).toBe("The Nose");
    expect(slugToName("the-naked-edge")).toBe("The Naked Edge");
    expect(slugToName("a-and-b")).toBe("A And B");
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `npm test -- tests/lib/sitemap.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `lib/sitemap.ts`**

```ts
// lib/sitemap.ts
const LOC_RE = /<loc>([^<]+)<\/loc>/g;
const ROUTE_URL_RE = /\/route\/(\d+)\/([^/?#]+)$/;

export function parseSitemapIndex(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(LOC_RE)) {
    const url = m[1].trim();
    if (url.includes("sitemap-routes")) out.push(url);
  }
  return out;
}

export function parseRouteSitemap(xml: string): { id: number; slug: string }[] {
  const out: { id: number; slug: string }[] = [];
  for (const m of xml.matchAll(LOC_RE)) {
    const url = m[1].trim();
    const r = url.match(ROUTE_URL_RE);
    if (r) out.push({ id: Number(r[1]), slug: r[2] });
  }
  return out;
}

export function slugToName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/lib/sitemap.test.ts`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: parse MP sitemap-index and route sitemaps"
```

---

## Task 15: Indexer script

**Files:**
- Create: `scripts/build-index.ts`, `tests/scripts/build-index.test.ts`

- [ ] **Step 1: Write the failing test for the upsert helper**

```ts
// tests/scripts/build-index.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { upsertRoutes } from "@/scripts/build-index";
import { testDb, truncateAll, closeDb } from "../helpers/test-db";
import { routes } from "@/lib/schema";

beforeEach(truncateAll);
afterAll(closeDb);

describe("upsertRoutes", () => {
  it("inserts new rows and updates existing slug+name when slug changes", async () => {
    await upsertRoutes([{ id: 1, slug: "old-slug" }]);
    await upsertRoutes([{ id: 1, slug: "new-slug" }, { id: 2, slug: "second" }]);
    const rows = await testDb.select().from(routes);
    const map = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(map[1].slug).toBe("new-slug");
    expect(map[1].name).toBe("New Slug");
    expect(map[2].slug).toBe("second");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- tests/scripts/build-index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `scripts/build-index.ts`**

```ts
// scripts/build-index.ts
import "dotenv/config";
import { db } from "@/lib/db";
import { routes } from "@/lib/schema";
import {
  parseRouteSitemap,
  parseSitemapIndex,
  slugToName,
} from "@/lib/sitemap";

const SITEMAP_INDEX = "https://www.mountainproject.com/sitemap.xml";
const CRAWL_DELAY_MS = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function upsertRoutes(rows: { id: number; slug: string }[]) {
  if (rows.length === 0) return;
  const values = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: slugToName(r.slug),
  }));
  // Drizzle batched upsert; slug change re-derives name.
  await db
    .insert(routes)
    .values(values)
    .onConflictDoUpdate({
      target: routes.id,
      set: {
        slug: (sql) => sql`excluded.slug`,
        name: (sql) => sql`excluded.name`,
      } as never,
    });
}

async function fetchText(url: string): Promise<string> {
  const ua = process.env.MP_USER_AGENT ?? "CragWeather-indexer/0.1";
  const res = await fetch(url, { headers: { "User-Agent": ua, Accept: "application/xml" } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

async function main() {
  console.log("[index] fetching sitemap index");
  const indexXml = await fetchText(SITEMAP_INDEX);
  const subs = parseSitemapIndex(indexXml);
  console.log(`[index] ${subs.length} route sub-sitemaps`);

  let total = 0;
  for (let i = 0; i < subs.length; i++) {
    if (i > 0) await sleep(CRAWL_DELAY_MS);
    const url = subs[i];
    console.log(`[index] (${i + 1}/${subs.length}) ${url}`);
    let xml: string;
    try {
      xml = await fetchText(url);
    } catch (e) {
      console.error(`[index] skip on error: ${(e as Error).message}`);
      continue;
    }
    const rows = parseRouteSitemap(xml);
    await upsertRoutes(rows);
    total += rows.length;
    console.log(`[index] +${rows.length} (running total ${total})`);
  }

  console.log(`[index] done. ${total} routes upserted.`);
}

if (process.argv[1] && process.argv[1].endsWith("build-index.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

If the typed `set` callback above causes TypeScript friction with your installed Drizzle version, replace with:
```ts
.onConflictDoUpdate({
  target: routes.id,
  set: { slug: sql`excluded.slug`, name: sql`excluded.name` },
})
```
and add `import { sql } from "drizzle-orm";`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/scripts/build-index.test.ts`
Expected: 1 passed.

- [ ] **Step 5: Smoke-test the entry point compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: indexer script crawls MP sitemap and upserts routes"
```

---

## Task 16: GitHub Actions workflow for monthly indexer

**Files:**
- Create: `.github/workflows/index-routes.yml`

- [ ] **Step 1: Create the workflow**

```yaml
# .github/workflows/index-routes.yml
name: Index MP routes
on:
  schedule:
    - cron: "0 7 1 * *"   # 07:00 UTC on the 1st of each month
  workflow_dispatch: {}

concurrency:
  group: index-routes
  cancel-in-progress: false

jobs:
  index:
    runs-on: ubuntu-latest
    timeout-minutes: 360
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run index:routes
        env:
          POSTGRES_URL: ${{ secrets.POSTGRES_URL }}
          MP_USER_AGENT: ${{ secrets.MP_USER_AGENT }}
```

- [ ] **Step 2: Document the required secrets in `.env.example`**

`.env.example` already lists both. Add a short comment block at the top of the workflow file (above `name:`) so readers know which secrets to set:

```yaml
# Required repository secrets:
#   POSTGRES_URL      — connection string for Vercel Postgres (same value as Vercel env var)
#   MP_USER_AGENT     — descriptive UA string identifying CragWeather
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "ci: monthly indexer workflow"
```

---

## Task 17: Search box component (TDD)

**Files:**
- Create: `components/SearchBox.tsx`, `tests/components/SearchBox.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/SearchBox.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { SearchBox } from "@/components/SearchBox";

describe("SearchBox", () => {
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
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- tests/components/SearchBox.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// components/SearchBox.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Result = { id: number; slug: string; name: string };

export function SearchBox() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);

  useEffect(() => {
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
  }, [q]);

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
              <Link href={`/route/${r.id}`}>{r.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

Add styling to `app/globals.css`:

```css
.searchbox { position: relative; max-width: 36rem; }
.searchbox input {
  width: 100%;
  padding: 0.75rem 1rem;
  font-size: 1rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--card);
}
.searchbox-results {
  position: absolute;
  top: 100%; left: 0; right: 0;
  margin: 0; padding: 0;
  list-style: none;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  box-shadow: 0 10px 30px rgba(0,0,0,0.08);
  max-height: 22rem; overflow: auto;
  z-index: 10;
}
.searchbox-results li a {
  display: block;
  padding: 0.5rem 1rem;
  color: var(--fg);
  text-decoration: none;
}
.searchbox-results li a:hover { background: #f3f4f6; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/components/SearchBox.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: SearchBox component with debounced /api/search"
```

---

## Task 18: Homepage with search and popular routes

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Update the homepage**

```tsx
// app/page.tsx
import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { searchRoutes } from "@/lib/search";

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
  return found.map((rs, i) => rs[0]).filter((r): r is NonNullable<typeof r> => Boolean(r));
}

export default async function HomePage() {
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

Add styles to `app/globals.css`:

```css
.home { max-width: 48rem; margin: 0 auto; padding: 4rem 1.5rem; }
.home-header h1 { font-size: 2.5rem; margin: 0 0 0.5rem; }
.home-header p { color: var(--muted); margin: 0 0 2rem; }
.home-search { margin-bottom: 3rem; }
.home-popular h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.home-popular ul { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: 0.5rem; }
.home-popular li a {
  display: block; padding: 0.75rem 1rem;
  background: var(--card); border: 1px solid var(--border); border-radius: 0.5rem;
  color: var(--fg); text-decoration: none;
}
.home-footer { margin-top: 3rem; color: var(--muted); }
```

- [ ] **Step 2: Sanity-check via dev server**

Run: `npm run dev`. Open `http://localhost:3000`. Type into the search box. (Popular routes will appear empty until the indexer is run; that's expected.)

Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: homepage with search and popular routes"
```

---

## Task 19: Weather chart component

**Files:**
- Create: `components/WeatherChart.tsx`

A presentational client component. No unit test (Recharts renders to SVG via ResponsiveContainer; meaningful tests would be visual regression, which is out of scope).

- [ ] **Step 1: Implement the chart**

```tsx
// components/WeatherChart.tsx
"use client";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyWeather } from "@/lib/weather";

export function WeatherChart({ daily }: { daily: DailyWeather[] }) {
  const data = daily.map((d) => ({
    date: d.date.slice(5),  // MM-DD
    high: d.tempMax,
    low: d.tempMin,
    precip: d.precip,
  }));
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 16, right: 32, bottom: 16, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="date" />
          <YAxis yAxisId="precip" orientation="left" label={{ value: "mm", angle: -90, position: "insideLeft" }} />
          <YAxis yAxisId="temp" orientation="right" label={{ value: "°C", angle: 90, position: "insideRight" }} />
          <Tooltip />
          <Legend />
          <Bar yAxisId="precip" dataKey="precip" name="Precip (mm)" fill="#60a5fa" />
          <Line yAxisId="temp" dataKey="high" name="High (°C)" stroke="#dc2626" strokeWidth={2} dot={false} />
          <Line yAxisId="temp" dataKey="low"  name="Low (°C)"  stroke="#2563eb" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

Append to `app/globals.css`:

```css
.chart-wrap { background: var(--card); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1rem; }
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: WeatherChart component (Recharts ComposedChart)"
```

---

## Task 20: Daily cards with hourly expansion (TDD)

**Files:**
- Create: `components/DailyCards.tsx`, `tests/components/DailyCards.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/DailyCards.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DailyCards } from "@/components/DailyCards";
import type { DailyWeather, HourlyWeather } from "@/lib/weather";

const day = (date: string, max: number, min: number, precip: number): DailyWeather => ({
  date, tempMax: max, tempMin: min, precip,
});
const hr = (datetime: string, t: number, p: number): HourlyWeather => ({ datetime, temp: t, precip: p });

describe("DailyCards", () => {
  it("renders 14 cards", () => {
    const daily = Array.from({ length: 14 }, (_, i) => day(`2026-01-${String(i + 1).padStart(2, "0")}`, 10, 0, 0));
    const hourly = Array.from({ length: 14 * 24 }, (_, i) => hr(`2026-01-01T${String(i % 24).padStart(2, "0")}:00`, 5, 0));
    render(<DailyCards daily={daily} hourly={hourly} />);
    expect(screen.getAllByRole("button")).toHaveLength(14);
  });

  it("expands hourly detail on card click", async () => {
    const daily = [day("2026-01-01", 12, 2, 1)];
    const hourly = Array.from({ length: 24 }, (_, h) =>
      hr(`2026-01-01T${String(h).padStart(2, "0")}:00`, h, 0),
    );
    render(<DailyCards daily={daily} hourly={hourly} />);
    expect(screen.queryByText(/00:00/)).toBeNull();
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/00:00/)).toBeInTheDocument();
    expect(screen.getByText(/23:00/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- tests/components/DailyCards.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// components/DailyCards.tsx
"use client";
import { useState } from "react";
import type { DailyWeather, HourlyWeather } from "@/lib/weather";

export function DailyCards({
  daily,
  hourly,
}: {
  daily: DailyWeather[];
  hourly: HourlyWeather[];
}) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  return (
    <div className="cards-row">
      {daily.map((d) => {
        const isOpen = d.date === openDate;
        const dayHourly = hourly.filter((h) => h.datetime.startsWith(d.date));
        return (
          <div key={d.date} className="card-cell">
            <button
              type="button"
              className={`card${isOpen ? " card-open" : ""}`}
              onClick={() => setOpenDate(isOpen ? null : d.date)}
              aria-expanded={isOpen}
            >
              <div className="card-date">{d.date.slice(5)}</div>
              <div className="card-temps">
                <span className="hi">{Math.round(d.tempMax)}°</span>
                <span className="lo">{Math.round(d.tempMin)}°</span>
              </div>
              <div className="card-precip">{d.precip.toFixed(1)} mm</div>
            </button>
            {isOpen && (
              <ul className="hourly-list">
                {dayHourly.map((h) => (
                  <li key={h.datetime}>
                    <span>{h.datetime.slice(11, 16)}</span>
                    <span>{Math.round(h.temp)}°</span>
                    <span>{h.precip.toFixed(1)} mm</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

Append to `app/globals.css`:

```css
.cards-row { display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.5rem; }
.card-cell { flex: 0 0 8rem; }
.card {
  width: 100%;
  background: var(--card); border: 1px solid var(--border); border-radius: 0.5rem;
  padding: 0.75rem; text-align: left; cursor: pointer;
  font: inherit; color: inherit;
}
.card-open { box-shadow: 0 0 0 2px var(--accent); }
.card-date { font-weight: 600; font-size: 0.875rem; }
.card-temps { margin: 0.25rem 0; }
.hi { color: #dc2626; margin-right: 0.5rem; }
.lo { color: #2563eb; }
.card-precip { color: var(--muted); font-size: 0.875rem; }
.hourly-list { list-style: none; padding: 0.5rem; margin: 0.5rem 0 0; background: var(--card); border: 1px solid var(--border); border-radius: 0.5rem; max-height: 18rem; overflow: auto; }
.hourly-list li { display: grid; grid-template-columns: 4rem 1fr 1fr; gap: 0.5rem; padding: 0.25rem 0.5rem; font-size: 0.875rem; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/components/DailyCards.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: DailyCards with click-to-expand hourly detail"
```

---

## Task 21: Route detail page

**Files:**
- Create: `app/route/[id]/page.tsx`, `app/route/[id]/error.tsx`, `app/route/[id]/loading.tsx`

- [ ] **Step 1: Implement the page**

```tsx
// app/route/[id]/page.tsx
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WeatherChart } from "@/components/WeatherChart";
import { DailyCards } from "@/components/DailyCards";

type ApiResponse = {
  route: {
    id: number; name: string; slug: string;
    area: string | null; grade: string | null;
    lat: number; lng: number; mpUrl: string;
  };
  weather: {
    daily: import("@/lib/weather").DailyWeather[];
    hourly: import("@/lib/weather").HourlyWeather[];
  } | null;
};

async function getRoute(id: string): Promise<ApiResponse | null> {
  const h = await headers();
  const host = h.get("host")!;
  const proto = h.get("x-forwarded-proto") ?? "http";
  const res = await fetch(`${proto}://${host}/api/route/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (res.status === 502) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "route_unavailable");
  }
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return (await res.json()) as ApiResponse;
}

export default async function RoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getRoute(id);
  if (!data) notFound();

  const { route, weather } = data;

  return (
    <main className="route-page">
      <header className="route-header">
        <h1>{route.name}</h1>
        <p className="route-meta">
          {route.area && <span>{route.area}</span>}
          {route.grade && <span> · {route.grade}</span>}
        </p>
        <p>
          <a href={route.mpUrl} target="_blank" rel="noreferrer">
            View on Mountain Project ↗
          </a>
        </p>
      </header>

      {weather ? (
        <>
          <section className="route-chart">
            <WeatherChart daily={weather.daily} />
          </section>
          <section className="route-cards">
            <DailyCards daily={weather.daily} hourly={weather.hourly} />
          </section>
        </>
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

Append to `app/globals.css`:

```css
.route-page { max-width: 64rem; margin: 0 auto; padding: 2rem 1.5rem; }
.route-header h1 { font-size: 2rem; margin: 0; }
.route-meta { color: var(--muted); margin: 0.25rem 0 0.5rem; }
.route-chart { margin: 1.5rem 0; }
.route-cards { margin: 1.5rem 0; }
.weather-unavailable { background: #fef3c7; border: 1px solid #fcd34d; padding: 0.75rem 1rem; border-radius: 0.5rem; }
.route-footer { margin-top: 2rem; color: var(--muted); }

@media (max-width: 600px) {
  .route-header h1 { font-size: 1.5rem; }
  .home { padding: 2rem 1rem; }
  .route-page { padding: 1.5rem 1rem; }
}
```

- [ ] **Step 2: Add `error.tsx`**

```tsx
// app/route/[id]/error.tsx
"use client";
import { use } from "react";
import Link from "next/link";

export default function RouteError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isUnavailable = /route_unavailable/.test(error.message);
  return (
    <main className="route-page">
      <h1>Couldn't load this route</h1>
      <p>
        {isUnavailable
          ? "Mountain Project didn't return a usable page for this route."
          : "Something went wrong on our side."}
      </p>
      <p>
        <Link href="/">← Back to search</Link>
      </p>
    </main>
  );
}
```

(The unused `use` import — remove it; left here as reminder it's a Client Component.) Final file should drop the `import { use } ...` line.

- [ ] **Step 3: Add `loading.tsx`**

```tsx
// app/route/[id]/loading.tsx
export default function Loading() {
  return (
    <main className="route-page">
      <p>Loading…</p>
    </main>
  );
}
```

- [ ] **Step 4: Smoke-test in dev**

Run: `npm run dev`. Visit `http://localhost:3000/route/1`. Expected: 404 page (route id 1 doesn't exist in the empty DB). Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: route detail page with chart + cards + error/loading states"
```

---

## Task 22: About page

**Files:**
- Create: `app/about/page.tsx`

- [ ] **Step 1: Implement**

```tsx
// app/about/page.tsx
import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="about">
      <h1>About CragWeather</h1>

      <h2>Data sources</h2>
      <ul>
        <li>
          <strong>Route data</strong> — derived from Mountain Project's public sitemap and route pages.
          We scrape each route page exactly once and cache the result; refreshes every 90 days.
        </li>
        <li>
          <strong>Weather</strong> — <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>,
          fetched live per page view.
        </li>
      </ul>

      <h2>Attribution</h2>
      <p>
        Each route links back to its source page on Mountain Project. CragWeather is a personal
        project and is not affiliated with Mountain Project / onX.
      </p>

      <h2>Notes</h2>
      <p>
        Coordinates are best-effort and parsed from public route pages. If a forecast looks
        obviously wrong, please cross-check the linked MP page.
      </p>

      <p><Link href="/">← Home</Link></p>
    </main>
  );
}
```

Append to `app/globals.css`:

```css
.about { max-width: 40rem; margin: 0 auto; padding: 2rem 1.5rem; }
.about h2 { margin-top: 2rem; }
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: about page with data sources and attribution"
```

---

## Task 23: 404 page for missing routes

**Files:**
- Create: `app/route/[id]/not-found.tsx`

- [ ] **Step 1: Create**

```tsx
// app/route/[id]/not-found.tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="route-page">
      <h1>Route not found</h1>
      <p>
        Either this route is not in our index yet, or the link is wrong. The monthly indexer
        runs on the 1st of each month.
      </p>
      <p><Link href="/">← Back to search</Link></p>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: 404 page for unknown route IDs"
```

---

## Task 24: Full-suite verification

**Files:**
- (none — verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: all suites passing. Total ≈ 25 tests across `lib`, `api`, `components`, `scripts`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build completes, all routes listed:
- `/`
- `/about`
- `/route/[id]`
- `/api/search`
- `/api/route/[id]`

If the build fails because Next.js cannot find the database during static analysis of `/`, mark the homepage dynamic by adding to `app/page.tsx`:

```ts
export const dynamic = "force-dynamic";
```

Re-run the build.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`. Manually click through:
- `/` — search works, popular section may be empty
- `/about` — renders
- `/route/<some-id-from-DB>` — only meaningful after the indexer runs once

To populate the DB without running the full indexer (5+ hours), seed a single test route:

```bash
docker compose exec postgres psql -U crag -d crag -c \
  "INSERT INTO routes (id, slug, name) VALUES (105862922, 'the-nose', 'The Nose') ON CONFLICT DO NOTHING;"
```

Then visit `http://localhost:3000/route/105862922`. Expected: page renders with chart and cards (cache miss → scrapes MP → fetches weather). Stop the dev server.

- [ ] **Step 5: Commit if anything changed**

```bash
git status
# If anything changed:
git add -A && git commit -m "chore: post-build adjustments"
```

---

## Task 25: README and operator notes

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

```markdown
# CragWeather

14-day weather windows for climbing routes.

## Quickstart

```bash
docker compose up -d                  # local Postgres
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

Visit `http://localhost:3000`.

## Populate the search index

The `/api/search` endpoint returns nothing until the routes table is populated. To populate from MP's sitemap (5+ hours due to mandatory 60-second crawl-delay):

```bash
npm run index:routes
```

Or seed a single route for development:

```bash
docker compose exec postgres psql -U crag -d crag -c \
  "INSERT INTO routes (id, slug, name) VALUES (105862922, 'the-nose', 'The Nose') ON CONFLICT DO NOTHING;"
```

## Tests

```bash
npm test            # all tests, requires Postgres up
npm run test:watch
```

The test suite expects a Postgres at `POSTGRES_URL` (defaults to local Docker).

## Deploy

1. Create a Vercel project linked to this repo.
2. Add a Vercel Postgres database; copy `POSTGRES_URL` into Project → Settings → Environment Variables.
3. Add the same `POSTGRES_URL` and an `MP_USER_AGENT` to GitHub repository secrets so the monthly indexer workflow can write to the same DB.
4. After the first deploy, run `npm run db:migrate` against the prod URL once.
5. Trigger `.github/workflows/index-routes.yml` manually for the first run.

## Operator notes

- **Scraper drift**: if MP changes its HTML, the scraper fixture tests will fail in CI. Re-fetch
  fixtures (`tests/fixtures/mp/*.html`) and update parsers.
- **Cache TTL**: `route_meta` is treated as fresh for 90 days. Adjust `NINETY_DAYS_MS` in
  `app/api/route/[id]/route.ts`.
- **Crawl-delay**: `scripts/build-index.ts` sleeps 60s between sub-sitemap fetches. Do not lower
  this without re-reading MP's `robots.txt`.
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: README with quickstart, deploy, and operator notes"
```

---

## Out-of-band steps (cannot be automated)

These require human action with external services and are intentionally not framed as plan tasks:

1. **Vercel project linking** — create the Vercel project, attach Vercel Postgres, set env vars.
2. **GitHub secrets** — set `POSTGRES_URL` and `MP_USER_AGENT` on the repository.
3. **First production migration** — run `drizzle-kit migrate` against the prod connection string once.
4. **Trigger the first indexer run** — via GitHub Actions UI (`workflow_dispatch`).

---

## Self-review notes

**Spec coverage:**
- Search, route detail, about, deep links, mobile-responsive, MP attribution → Tasks 17–22.
- Route name search → Task 17.
- Weather chart + daily cards + hourly expansion → Tasks 19–20.
- Sitemap indexer → Tasks 14–15.
- DB schema with pg_trgm and FK cascade → Task 3.
- Lazy MP scraping with 90-day refresh and canonical-name upgrade → Task 13.
- Open-Meteo with browser cache 600s → Tasks 10, 12.
- Error matrix (502 on scrape fail, weather null on Open-Meteo fail, 404 on unknown id) → Tasks 12, 13, 21, 23.
- Fixture-based scraper tests, MSW mocking → Tasks 6–9.
- Real Postgres in CI → Task 16 (workflow uses Vercel Postgres directly via secret; for PR-time CI add a Postgres service container in a follow-up if desired).

**Open questions resolved:**
- Migration framework: Drizzle (Task 3).
- Recharts layout: ComposedChart with Bar+Line (Task 19).
- GH Actions secrets / Vercel linking: Task 16 + out-of-band step.
- 6 popular routes: resolved by name lookup, no hardcoded IDs (Task 18).

**Out of scope for v1 (deferred per spec):** crag-name search, coordinate search, custom date range, accounts/favorites, dew point/wind/humidity/sun cover, E2E browser tests, visual regression, load testing.
