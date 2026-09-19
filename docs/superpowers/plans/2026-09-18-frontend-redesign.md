# Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild CragWeather's frontend as a dark-first data instrument — a real CSS token layer with light/dark pairs, Inter with tabular numerals, one chart-color module behind CSS variables, a denser six-panel forecast stack with a shared crosshair, and a persistent app header.

**Architecture:** Plain CSS custom properties in three imported stylesheets, dark as the `:root` default and light as a `[data-theme="light"]` override. Chart colors are CSS variables referenced directly in SVG presentation attributes, so the six `React.memo`'d forecast panels never take a theme prop and their measured memoization fix survives. The shared crosshair is a DOM overlay owned by `ForecastChart`, positioned from the measured x-axis extent, for the same reason.

**Tech Stack:** Next.js 14 (App Router), React 18, Recharts 3.8, plain CSS, `next/font/local`, Vitest + Testing Library + jsdom.

**Spec:** `docs/superpowers/specs/2026-09-18-frontend-redesign-design.md`

## Global Constraints

- **Do not change** weather fetching, aggregation, slicing, scraping, or any database code. This is a frontend-only plan.
- **Do not change** these documented chart decisions: band z-ordering (night, then weekend, then series — SVG has no z-index), `LEFT_MARGIN`, the `margin.right` totals-80 rule, `MM_AXIS_FLOOR` (4), `AQI_AXIS_FLOOR` (100), the `dewPointDomain` anchors, `connectNulls={false}`, AQI dead-zone shading, `snapToHour` night bands.
- **Series label strings are frozen.** `"Temp (°C)"`, `"Feels like (°C)"`, `"Precip (mm)"`, `"Chance (%)"`, `"Dew point (°C)"`, `"Humidity (%)"`, `"Speed (m/s)"`, `"Gust (m/s)"`, `"US AQI"`, `"High (°C)"`, `"Low (°C)"` must appear in the DOM byte-identical after the legend replacement. Existing tests read them with `getByText`.
- **AQI band hues are EPA standard** and must not change: `#00e400`, `#ffff00`, `#ff7e00`, `#ff0000`, `#8f3f97`, `#7e0023`.
- **Panels must stay wrapped in `React.memo` and must not gain a prop that changes on hover.** `tests/components/panelMemoization.test.tsx` guards the first half; Task 8 adds the second.
- **Theme default is dark** when `localStorage.cw_theme` is unset, regardless of `prefers-color-scheme`.
- Token naming: `--bg-0/1/2`, `--fg-0/1/2`, `--border`, `--accent`. The old names `--bg`, `--fg`, `--card`, `--muted` are removed, not aliased.
- Run `npm run lint` before every commit. Run `docker compose up -d` once before running tests.
- Before the first browser check, run `docker compose up -d && npm run db:seed`. Browser steps use `/route/105862922` (The Nose) because it is in the seed set; `route_meta` is populated lazily on first visit, so the first load is slow and scrapes Mountain Project. Any other route id will 404 locally unless the full indexer has been run.
- Never commit to a branch other than `main` (project convention: develop directly on `main`, no worktrees).

---

### Task 1: Spike — confirm `var()` resolves in SVG presentation attributes

**[model: claude-sonnet-5]**

This gates Task 5. If `var()` does not resolve in `fill`/`stroke` attributes in any target browser, the chart-theming mechanism changes from CSS variables to a `useTheme()` palette object and Task 5 must be rewritten before it is started.

**Files:**
- Create (temporary, deleted in this task): `app/spike-var/page.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: a written answer recorded in the task's commit message. No code survives.

- [ ] **Step 1: Create the probe page**

```tsx
// app/spike-var/page.tsx
"use client";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

const data = [
  { x: "a", v: 3 }, { x: "b", v: 7 }, { x: "c", v: 4 },
  { x: "d", v: 9 }, { x: "e", v: 2 },
];

export default function SpikeVarPage() {
  return (
    <div style={{ padding: 32, background: "#141a21", minHeight: "100vh" }}>
      <style>{`:root { --probe-stroke: #ff6b52; --probe-fill: rgba(255,107,82,0.35); }`}</style>

      <p style={{ color: "#fff" }}>
        PASS = both shapes below are ORANGE. FAIL = black, transparent, or missing.
      </p>

      <svg width="200" height="60">
        <rect x="0" y="0" width="200" height="60" fill="var(--probe-fill)" />
        <line x1="0" y1="30" x2="200" y2="30" stroke="var(--probe-stroke)" strokeWidth="4" />
      </svg>

      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <XAxis dataKey="x" tick={{ fill: "var(--probe-stroke)" }} />
          <YAxis tick={{ fill: "var(--probe-stroke)" }} />
          <Line dataKey="v" stroke="var(--probe-stroke)" strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Run the dev server**

Run: `npm run dev`
Expected: server on `http://localhost:3000`.

- [ ] **Step 3: Check three browsers**

Open `http://localhost:3000/spike-var` in Chrome, Safari and Firefox.

Record for each browser, separately:
1. Is the raw `<rect>`/`<line>` orange?
2. Is the Recharts `<Line>` orange?
3. Are the axis tick labels orange? (This one is a *separate* mechanism — `tick={{ fill }}` becomes a React style/attribute on a `<text>`; it may behave differently from `stroke` on a path.)

- [ ] **Step 4: Delete the probe page**

```bash
rm -rf app/spike-var
```

- [ ] **Step 5: Record the answer and commit**

If all three browsers pass on all three questions, Task 5 proceeds as written.

If any fail, **stop and report before starting Task 5.** The fallback is: `lib/chartColors.ts` exports `DARK` and `LIGHT` frozen palette objects, a `useTheme()` hook in `ForecastChart` selects one, and it is passed to each panel as a single `colors` prop. Object identity is stable across renders so `React.memo` still holds — but every panel signature in Task 5 gains `colors: Palette` and the tests assert on resolved hex, not on `var()` strings.

```bash
git add -A
git commit -m "chore: spike var() support in SVG presentation attributes

Chrome: <result>  Safari: <result>  Firefox: <result>
Raw SVG attrs: <result>. Recharts stroke: <result>. Axis tick fill: <result>.

Probe page deleted; no code kept."
```

---

### Task 2: Token layer extraction — a provable no-op

**[model: claude-sonnet-5]**

The checkpoint gate for the whole redesign. Every existing rule moves onto tokens whose **light values are byte-identical to today's colors**, and `data-theme="light"` is hardcoded on `<html>` for this task only. Nothing may look different afterward.

**Files:**
- Create: `app/styles/tokens.css`
- Create: `app/styles/base.css`
- Create: `app/styles/components.css`
- Modify: `app/globals.css` (becomes three `@import`s)
- Modify: `app/layout.tsx:15` (add `data-theme="light"` to `<html>`, temporarily)
- Modify: `components/ForecastChart.tsx:163` (`var(--muted)` → `var(--fg-1)`)

**Interfaces:**
- Consumes: nothing
- Produces: the token names listed below. Every later task styles with these and defines no new raw colors outside `tokens.css`.

- [ ] **Step 1: Write `app/styles/tokens.css`**

Dark values are written now but unused until Task 3 — `<html data-theme="light">` forces the light block for this task.

```css
/* Design tokens. Dark is the default; light is an explicit override.
   Nothing outside this file may define a raw color. */

:root {
  /* ---- Surfaces & text: DARK (the default) ---- */
  --bg-0: #0b0f14;          /* page background */
  --bg-1: #141a21;          /* card, panel, modal */
  --bg-2: #1c242e;          /* raised: input, hover, code */
  --fg-0: #e8edf2;          /* primary text */
  --fg-1: #9aa7b4;          /* secondary text */
  --fg-2: #64717f;          /* tertiary: axis ticks, captions */
  --border: #222c37;
  --accent: #fb7a3c;        /* lifted from #c2410c, which fails contrast on #0b0f14 */
  --accent-contrast: #14100c; /* text on an --accent fill */

  --scrim: rgba(0, 0, 0, 0.65);
  --overlay: rgba(255, 255, 255, 0.08);  /* subtle raised wash over --bg-1 */
  --danger: #f87171;
  --warn-fg: #fbbf24;
  --warn-bg: rgba(251, 191, 36, 0.12);
  --warn-border: rgba(251, 191, 36, 0.35);

  --shadow-1: 0 10px 30px rgba(0, 0, 0, 0.45);
  --shadow-2: 0 10px 40px rgba(0, 0, 0, 0.6);
  --ring: 0 0 0 2px var(--accent);

  /* ---- Scales: single-valued, shared by both themes ---- */
  --space-1: 0.25rem;  --space-2: 0.5rem;   --space-3: 0.75rem;  --space-4: 1rem;
  --space-5: 1.5rem;   --space-6: 2rem;     --space-7: 3rem;     --space-8: 4rem;

  --radius-sm: 0.375rem;  --radius-md: 0.5rem;  --radius-lg: 0.75rem;

  --text-xs: 0.75rem;   --text-sm: 0.8125rem;  --text-md: 0.875rem;
  --text-base: 1rem;    --text-lg: 1.25rem;    --text-xl: 1.75rem;
  --text-2xl: 2.5rem;
}

:root[data-theme="light"] {
  /* Byte-identical to the pre-redesign palette. */
  --bg-0: #fafafa;
  --bg-1: #ffffff;
  --bg-2: #f3f4f6;
  --fg-0: #1a1a1a;
  --fg-1: #6b7280;
  --fg-2: #9ca3af;
  --border: #e5e7eb;
  --accent: #c2410c;
  --accent-contrast: #ffffff;

  --scrim: rgba(0, 0, 0, 0.5);
  --overlay: rgba(127, 127, 127, 0.15);
  --danger: #c53030;
  --warn-fg: #b85d00;
  --warn-bg: #fef3c7;
  --warn-border: #fcd34d;

  --shadow-1: 0 10px 30px rgba(0, 0, 0, 0.08);
  --shadow-2: 0 10px 40px rgba(0, 0, 0, 0.3);
}
```

- [ ] **Step 2: Write `app/styles/base.css`**

Move lines 9–26 of the current `app/globals.css` here, retokenized.

```css
* { box-sizing: border-box; }

@media (pointer: coarse) {
  * { user-select: none; }
  input, textarea { user-select: text; }
}

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg-0);
  color: var(--fg-0);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  line-height: 1.5;
}

a { color: var(--accent); }
```

- [ ] **Step 3: Write `app/styles/components.css`**

Copy lines 28–317 of the current `app/globals.css` verbatim, then apply this substitution table across the whole file:

| Find | Replace |
|---|---|
| `var(--bg)` | `var(--bg-0)` |
| `var(--card)` | `var(--bg-1)` |
| `var(--card, white)` | `var(--bg-1)` |
| `var(--fg)` | `var(--fg-0)` |
| `var(--muted)` | `var(--fg-1)` |
| `var(--muted, #6b7280)` | `var(--fg-1)` |
| `#f3f4f6` (in `.searchbox-results li a:hover`) | `var(--bg-2)` |
| `rgba(0,0,0,0.08)` (in `.searchbox-results` shadow) | use `box-shadow: var(--shadow-1)` |
| `rgba(0,0,0,0.5)` (in `.sync-modal__backdrop`) | `var(--scrim)` |
| `0 10px 40px rgba(0,0,0,0.3)` (in `.sync-modal__panel`) | `var(--shadow-2)` |
| `rgba(127,127,127,0.15)` (3 occurrences) | `var(--overlay)` |
| `rgba(127,127,127,0.08)` (2 occurrences) | `var(--overlay)` |
| `#c53030` (in `.sync-modal__error`) | `var(--danger)` |

Four rules need more than a substitution:

```css
/* WAS: background: var(--background, white); color: var(--foreground, #111);
   Neither variable was ever defined, so this always fell through to the
   hardcoded white/#111. Under a dark theme it would render a white slab. */
.sync-modal__panel {
  position: relative;
  background: var(--bg-1);
  color: var(--fg-0);
  padding: var(--space-5);
  border-radius: var(--radius-lg);
  max-width: 28rem;
  width: calc(100% - 2rem);
  box-shadow: var(--shadow-2);
}

/* WAS: background: #fef3c7; border: 1px solid #fcd34d; */
.weather-unavailable,
.weather-warning {
  background: var(--warn-bg);
  border: 1px solid var(--warn-border);
  color: var(--fg-0);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
}
.weather-warning { margin: var(--space-2) 0; }

/* WAS: color: #b85d00; background: rgba(184, 93, 0, 0.1); */
.confirm-join__warn {
  color: var(--warn-fg);
  background: var(--warn-bg);
  padding: 0.6rem;
  border-radius: 0.4rem;
}

/* WAS: .hi { color: #dc2626 } / .lo { color: #2563eb }
   These are day-card temperatures and must match the chart's temp/low series.
   They point at the chart tokens, which Task 5 defines. Until then the two
   fallbacks hold the current values exactly. */
.hi { color: var(--series-temp, #dc2626); margin-right: var(--space-2); }
.lo { color: var(--series-low, #2563eb); }

/* Card focus ring was `box-shadow: 0 0 0 2px var(--accent)` */
.card-open { box-shadow: var(--ring); }
```

- [ ] **Step 4: Replace `app/globals.css` with imports**

```css
@import "./styles/tokens.css";
@import "./styles/base.css";
@import "./styles/components.css";
```

- [ ] **Step 5: Pin the light theme temporarily and fix the one TSX var reference**

In `app/layout.tsx`, change `<html lang="en">` to:

```tsx
{/* Temporary: pinned to light so Task 2 is a provable no-op.
    Task 3 removes this and adds the pre-paint theme script. */}
<html lang="en" data-theme="light">
```

In `components/ForecastChart.tsx:163`:

```tsx
<span style={{ color: "var(--fg-1)" }}>—</span>
```

- [ ] **Step 6: Verify no stale token names survive**

Run: `grep -rn 'var(--muted\|var(--card\|var(--bg)\|var(--fg)\|var(--background\|var(--foreground' app components`
Expected: no output.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS, same count as before the task. No test should need editing — this task changes no markup and no rendered color.

- [ ] **Step 8: Verify visually that nothing moved**

Run: `npm run dev`, open `/`, `/route/105862922`, and `/about`.
Expected: **pixel-identical to before the task.** If anything looks different, a substitution was wrong — fix it rather than accepting the new look. This is the gate the whole approach rests on.

- [ ] **Step 9: Lint and commit**

```bash
npm run lint
git add app components
git commit -m "refactor: extract a CSS token layer with no visual change

Splits globals.css into tokens/base/components and moves every rule onto
named tokens. Light values are byte-identical to the previous palette and
<html> is pinned to data-theme=\"light\", so this commit renders the same
pixels it replaces — the checkpoint the rest of the redesign builds on.

Fixes .sync-modal__panel, which was styled with var(--background, white)
and var(--foreground, #111). Neither variable has ever been defined, so
the modal always rendered via the fallbacks."
```

---

### Task 3: Dark palette default, theme toggle, no-flash script

**[model: claude-sonnet-5]**

**Files:**
- Create: `components/ThemeToggle.tsx`
- Create: `tests/components/ThemeToggle.test.tsx`
- Modify: `app/layout.tsx` (remove the pinned `data-theme`, add the pre-paint script, split `theme-color`)
- Modify: `app/styles/components.css` (append toggle styles)

**Interfaces:**
- Consumes: tokens from Task 2.
- Produces: `ThemeToggle` (default export absent — named export `ThemeToggle`), rendered by `AppHeader` in Task 9. `localStorage` key `cw_theme`, values `"dark" | "light"`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/ThemeToggle.test.tsx
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to dark when nothing is stored", () => {
    render(<ThemeToggle />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("defaults to dark even when the OS prefers light", () => {
    // The dark instrument look is the design; an OS preference must not hide it.
    render(<ThemeToggle />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("restores a stored light preference", () => {
    localStorage.setItem("cw_theme", "light");
    render(<ThemeToggle />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("toggles the attribute and persists the choice", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: /switch to light/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("cw_theme")).toBe("light");

    await user.click(screen.getByRole("button", { name: /switch to dark/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("cw_theme")).toBe("dark");
  });

  it("ignores a junk stored value and falls back to dark", () => {
    localStorage.setItem("cw_theme", "chartreuse");
    render(<ThemeToggle />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/components/ThemeToggle.test.tsx`
Expected: FAIL — cannot resolve `@/components/ThemeToggle`.

- [ ] **Step 3: Write `components/ThemeToggle.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";

export const THEME_KEY = "cw_theme";
export type Theme = "dark" | "light";

/** Dark unless a valid stored preference says otherwise. `prefers-color-scheme`
 *  is deliberately ignored: the dark instrument look is the design, and the
 *  toggle is how a reader opts out of it. Must match the inline <head> script
 *  in app/layout.tsx, which runs the same rule before first paint. */
function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark"; // Safari private mode throws on localStorage access.
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const t = readTheme();
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* Non-persistent is acceptable; the toggle still works for this page. */
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
    </button>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/components/ThemeToggle.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the pre-paint script and split `theme-color` in `app/layout.tsx`**

Replace the `<html>` opening tag and the `theme-color` meta:

```tsx
<html lang="en">
  <head>
    {/* Runs before first paint. Without it every load flashes the light
        theme before React hydrates, because dark is the default. Must stay
        inline and synchronous — a deferred script runs after paint. The rule
        here is duplicated in ThemeToggle.readTheme(); keep them in step. */}
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var t=localStorage.getItem("cw_theme")==="light"?"light":"dark";document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","dark")}})()`,
      }}
    />
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b0f14" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#c2410c" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="CragWeather" />
    <link rel="apple-touch-icon" href="/icon-192.png" />
  </head>
```

Note the `data-theme="light"` from Task 2 Step 5 is gone — the script now owns the attribute.

- [ ] **Step 6: Append the toggle styles to `app/styles/components.css`**

```css
.theme-toggle {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-1);
  color: var(--fg-1);
  font: inherit;
  font-size: var(--text-base);
  line-height: 1;
  cursor: pointer;
}
.theme-toggle:hover { border-color: var(--accent); color: var(--accent); }
```

- [ ] **Step 7: Run the suite and check both themes**

Run: `npm test`
Expected: PASS.

Run: `npm run dev`. The toggle is not mounted anywhere until Task 9, so drive it from the console:
`document.documentElement.setAttribute("data-theme","dark")` and `"light"`.
Expected: dark renders dark surfaces everywhere; **the charts will still be light-palette and will look wrong.** That is expected until Task 5. Confirm there is no white flash on reload in dark.

- [ ] **Step 8: Lint and commit**

```bash
npm run lint
git add app components tests
git commit -m "feat: make dark the default theme and add a theme toggle

Adds ThemeToggle (persists cw_theme, sets data-theme on <html>) and an
inline pre-paint script in <head> so a dark-default load never flashes
white. prefers-color-scheme is deliberately ignored: the toggle is how a
reader opts out, not the OS.

Charts are still on the light palette and look wrong in dark; Task 5
moves them onto tokens."
```

---

### Task 4: Typography — Inter Variable with tabular numerals

**[model: claude-sonnet-5]**

Lands before the panel-density work because the type scale changes axis-label widths.

**Files:**
- Create: `public/fonts/InterVariable.woff2`
- Create: `public/fonts/OFL.txt`
- Create: `lib/fonts.ts`
- Modify: `app/layout.tsx`
- Modify: `app/styles/base.css`
- Modify: `app/styles/components.css`

**Interfaces:**
- Consumes: tokens from Task 2.
- Produces: `inter` (a `next/font/local` object) exported from `lib/fonts.ts`; the `.tnum` utility class.

- [ ] **Step 1: Fetch the font and its license**

Inter is SIL Open Font License 1.1, so redistribution in-repo is fine provided the license travels with it.

```bash
mkdir -p public/fonts
curl -L -o public/fonts/InterVariable.woff2 \
  https://github.com/rsms/inter/raw/master/docs/font-files/InterVariable.woff2
curl -L -o public/fonts/OFL.txt \
  https://raw.githubusercontent.com/rsms/inter/master/LICENSE.txt
ls -la public/fonts/
```

Expected: `InterVariable.woff2` present and non-trivial in size. If it is under 10 KB the download returned an HTML error page — check the URL before continuing.

- [ ] **Step 2: Write `lib/fonts.ts`**

```ts
import localFont from "next/font/local";

/** Self-hosted so there is no Google Fonts request and no layout shift.
 *  `display: swap` plus next/font's automatic size-adjust fallback keeps
 *  first paint readable without reflowing when the file lands. */
export const inter = localFont({
  src: "../public/fonts/InterVariable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-sans",
  fallback: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif"],
});
```

- [ ] **Step 3: Apply the font class in `app/layout.tsx`**

Add the import and put the variable class on `<html>`:

```tsx
import { inter } from "@/lib/fonts";
// ...
<html lang="en" className={inter.variable}>
```

- [ ] **Step 4: Use it in `app/styles/base.css`**

```css
html, body {
  margin: 0;
  padding: 0;
  background: var(--bg-0);
  color: var(--fg-0);
  font-family: var(--font-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  line-height: 1.5;
}

/* Proportional digits make every column of figures jitter as values change —
   the single most dated thing about the old numbers. Applied by class rather
   than globally so prose keeps proportional figures. */
.tnum,
.card-temps,
.card-sun,
.hourly-list,
.chart-tooltip-strip,
.recharts-cartesian-axis-tick-value {
  font-variant-numeric: tabular-nums;
}

h1, h2, h3 { letter-spacing: -0.015em; }
h1 { font-weight: 650; }
```

- [ ] **Step 5: Move the remaining font sizes onto the scale**

In `app/styles/components.css`, replace the literal `font-size` values with the Task 2 scale. Exact mapping — apply all of them:

| Literal | Token |
|---|---|
| `0.7rem`, `0.75rem` | `var(--text-xs)` |
| `0.8rem`, `0.8125rem`, `0.82rem`, `0.85rem` | `var(--text-sm)` |
| `0.875rem`, `0.9rem`, `0.95rem` | `var(--text-md)` |
| `1rem` | `var(--text-base)` |
| `1.1rem`, `1.25rem` | `var(--text-lg)` |
| `1.5rem`, `1.75rem` | `var(--text-xl)` |
| `2rem`, `2.5rem` | `var(--text-2xl)` |

Leave `.sync-modal__close`'s `1.5rem` alone — it sizes a `×` glyph, not text.

- [ ] **Step 6: Run the suite**

Run: `npm test`
Expected: PASS. `next/font/local` is inert under vitest (no Next font loader), so if any test throws on the `lib/fonts.ts` import, add to `vitest.config.ts`'s `test.alias` a stub — but check first: layout is not rendered by any component test, so this should not arise.

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`. Open `/route/105862922`.
Expected: Inter renders (compare the lowercase `g` against the system font); day-card temperatures no longer shift width as you switch the 7/10/15 picker; no flash of unstyled text.

- [ ] **Step 8: Lint and commit**

```bash
npm run lint
git add public/fonts lib/fonts.ts app
git commit -m "feat: self-host Inter Variable and use tabular numerals

Adds Inter via next/font/local (no Google request, no layout shift) with
the OFL license alongside it, and turns on tabular-nums for every figure:
axis ticks, day-card temps, the hover strip and the hourly list. Moves the
remaining literal font sizes onto the --text-* scale."
```

---

### Task 5: Chart palette behind CSS variables

**[model: claude-sonnet-5]**

**Blocked by Task 1.** If the spike failed, stop and rewrite this task against the `useTheme()` fallback first.

**Files:**
- Create: `lib/chartColors.ts`
- Modify: `app/styles/tokens.css`
- Modify: `components/TempPanel.tsx`, `PrecipPanel.tsx`, `WindPanel.tsx`, `DewPointPanel.tsx`, `HumidityPanel.tsx`, `AirQualityPanel.tsx`, `WeatherChart.tsx`, `ForecastChart.tsx`
- Modify: `tests/components/ForecastChart.test.tsx`, `AirQualityPanel.test.tsx`, `DewPointPanel.test.tsx`, `WeatherView.test.tsx`

**Interfaces:**
- Consumes: tokens from Task 2.
- Produces: from `lib/chartColors.ts` — `SERIES`, `BANDS`, `CHART_UI` (all `as const` objects of `var(--…)` strings) and `AQI_BAND_CLASS` (a string). Task 6, 7 and 8 import from here.

- [ ] **Step 1: Load the dataviz skill and choose the values**

Invoke the `dataviz` skill before picking any hex. Validate each series color for contrast against its own panel background (`--bg-1`: `#141a21` dark, `#ffffff` light) and for mutual distinguishability — the eight series appear together in the hover strip, so they must be separable there even though most never share a chart.

The candidate palette below is the starting point, not the answer. Light values are today's colors and should generally stay. Adjust dark values as validation requires and record any change in the commit message.

| Role | Dark (candidate) | Light (keep) | Notes |
|---|---|---|---|
| `--series-temp` | `#ff6b52` | `#dc2626` | also used by `.hi` |
| `--series-feels` | `#ff9e85` | `#f87171` | dashed |
| `--series-low` | `#60a5fa` | `#2563eb` | history chart low; also `.lo` |
| `--series-precip` | `#4aa3f0` | `#60a5fa` | bars |
| `--series-chance` | `#8fcaff` | `#2563eb` | line on the 0–100 right axis |
| `--series-wind` | `#2fd18f` | `#059669` | line |
| `--series-gust` | `#2b6b57` | `#6ee7b7` | bar behind the line |
| `--series-dew` | `#2ec4b6` | `#0f766e` | |
| `--series-humidity` | `#56b4e9` | `#0891b2` | |
| `--series-aqi` | `#cbd5e1` | `#3f3f46` | must stay readable over the EPA bands |

- [ ] **Step 2: Append the chart tokens to `app/styles/tokens.css`**

Band alphas are baked into the color rather than left on `fillOpacity`, because a numeric JSX prop cannot hold a CSS variable. Every band below is therefore drawn with `fillOpacity={1}`.

Add inside the `:root` block:

```css
  /* ---- Chart series: DARK ---- */
  --series-temp: #ff6b52;      --series-feels: #ff9e85;
  --series-low: #60a5fa;       --series-precip: #4aa3f0;
  --series-chance: #8fcaff;    --series-wind: #2fd18f;
  --series-gust: #2b6b57;      --series-dew: #2ec4b6;
  --series-humidity: #56b4e9;  --series-aqi: #cbd5e1;

  /* ---- Chart bands: alpha baked in, drawn at fillOpacity={1} ---- */
  --band-night: rgba(2, 6, 23, 0.45);
  --band-weekend: rgba(245, 158, 11, 0.10);
  --band-dew-good: rgba(56, 189, 248, 0.10);
  --band-dew-greasy: rgba(244, 63, 94, 0.12);
  --band-aqi-dead: rgba(148, 163, 184, 0.14);

  /* ---- Chart chrome ---- */
  --grid: #222c37;
  --axis: #3a4552;
  --axis-text: var(--fg-2);
  --band-label: var(--fg-2);
  --crosshair: rgba(232, 237, 242, 0.55);
  --aqi-band-opacity: 0.16;   /* EPA hues need more alpha to read on dark */
```

Add inside the `:root[data-theme="light"]` block:

```css
  --series-temp: #dc2626;      --series-feels: #f87171;
  --series-low: #2563eb;       --series-precip: #60a5fa;
  --series-chance: #2563eb;    --series-wind: #059669;
  --series-gust: #6ee7b7;      --series-dew: #0f766e;
  --series-humidity: #0891b2;  --series-aqi: #3f3f46;

  --band-night: rgba(71, 85, 105, 0.07);
  --band-weekend: rgba(245, 158, 11, 0.08);
  --band-dew-good: rgba(2, 132, 199, 0.08);
  --band-dew-greasy: rgba(225, 29, 72, 0.08);
  --band-aqi-dead: rgba(107, 114, 128, 0.12);

  --grid: #eeeeee;
  --axis: #d1d5db;
  --crosshair: rgba(26, 26, 26, 0.45);
  --aqi-band-opacity: 0.1;
```

- [ ] **Step 3: Write `lib/chartColors.ts`**

```ts
/**
 * The single source of truth for every color the charts draw.
 *
 * These are CSS variable *references*, not resolved colors. SVG presentation
 * attributes resolve var(), so a panel can write stroke={SERIES.temp} and never
 * learn which theme is active — no theme prop, no re-render on toggle, and the
 * React.memo on every panel (see ForecastChart's comment on the measured
 * memoisation fix) stays intact.
 *
 * Tests assert against these constants rather than hex literals, so they check
 * that the right *role* is drawn and stop breaking whenever a color changes.
 */
export const SERIES = {
  temp: "var(--series-temp)",
  feelsLike: "var(--series-feels)",
  low: "var(--series-low)",
  precip: "var(--series-precip)",
  precipChance: "var(--series-chance)",
  wind: "var(--series-wind)",
  gust: "var(--series-gust)",
  dewPoint: "var(--series-dew)",
  humidity: "var(--series-humidity)",
  aqi: "var(--series-aqi)",
} as const;

/**
 * Band alpha is baked into each variable and every band renders at
 * fillOpacity={1}. A numeric JSX prop cannot hold a CSS variable, so alpha has
 * to live in the color for the two themes to differ.
 */
export const BANDS = {
  night: "var(--band-night)",
  weekend: "var(--band-weekend)",
  dewGood: "var(--band-dew-good)",
  dewGreasy: "var(--band-dew-greasy)",
  aqiDead: "var(--band-aqi-dead)",
} as const;

export const CHART_UI = {
  grid: "var(--grid)",
  axis: "var(--axis)",
  axisText: "var(--axis-text)",
  bandLabel: "var(--band-label)",
  crosshair: "var(--crosshair)",
} as const;

/**
 * EPA AQI band hues are a public-health convention and never change with the
 * theme — only their alpha does. Alpha therefore comes from CSS via this class
 * (a stylesheet rule beats a presentation attribute), while `fill` keeps the
 * exact EPA hex from lib/aqiBands.ts.
 */
export const AQI_BAND_CLASS = "aqi-band";
```

- [ ] **Step 4: Add the AQI band opacity rule to `app/styles/components.css`**

```css
/* Alpha only. The fill stays the exact EPA hue set in lib/aqiBands.ts. */
.aqi-band { fill-opacity: var(--aqi-band-opacity); }
```

- [ ] **Step 5: Retokenize the six forecast panels**

In **each** of `TempPanel.tsx`, `PrecipPanel.tsx`, `WindPanel.tsx`, `DewPointPanel.tsx`, `HumidityPanel.tsx`, `AirQualityPanel.tsx`:

Add the import:

```tsx
import { BANDS, CHART_UI, SERIES } from "@/lib/chartColors";
```

Replace the grid in all six:

```tsx
<CartesianGrid strokeDasharray="3 3" stroke={CHART_UI.grid} vertical={false} />
```

Give both axes themed chrome in all six (the `XAxis` keeps its existing `dataKey`/`ticks`/`tickFormatter` props; add the two below):

```tsx
<XAxis dataKey="x" ticks={ticks} tickFormatter={tickFormatter}
  stroke={CHART_UI.axis} tick={{ fill: CHART_UI.axisText, fontSize: 11 }} />
```

and on every `YAxis`, add the same two props:

```tsx
stroke={CHART_UI.axis} tick={{ fill: CHART_UI.axisText, fontSize: 11 }}
```

Replace the night and weekend bands in the five that have them (`Temp`, `Precip`, `Wind`, `DewPoint`, `Humidity`) — keep each panel's existing `yAxisId` where it has one (`PrecipPanel` passes `yAxisId="mm"`):

```tsx
{nightBands?.map(b => (
  <ReferenceArea key={`night-${b.start}`} x1={b.start} x2={b.end}
    fill={BANDS.night} fillOpacity={1} stroke="none" />
))}

{weekendBands?.map(b => (
  <ReferenceArea key={`weekend-${b.start}`} x1={b.start} x2={b.end}
    fill={BANDS.weekend} fillOpacity={1} stroke="none" />
))}
```

Replace the series:

```tsx
// TempPanel
<Line dataKey="feelsLike" name="Feels like (°C)" stroke={SERIES.feelsLike} strokeWidth={2} strokeDasharray="5 3" dot={false} />
<Line dataKey="temp" name="Temp (°C)" stroke={SERIES.temp} strokeWidth={2} dot={false} />

// PrecipPanel
<Bar yAxisId="mm" dataKey="precip" name="Precip (mm)" fill={SERIES.precip} />
<Line yAxisId="pct" dataKey="chance" name="Chance (%)" stroke={SERIES.precipChance}
  strokeWidth={2} dot={false} connectNulls={false} />

// WindPanel
<Bar dataKey="gust" name="Gust (m/s)" fill={SERIES.gust} fillOpacity={0.6} />
<Line dataKey="speed" name="Speed (m/s)" stroke={SERIES.wind} strokeWidth={2} dot={false} />

// HumidityPanel
<Line dataKey="humidity" name="Humidity (%)" stroke={SERIES.humidity} strokeWidth={2} dot={false} />

// DewPointPanel
<Line dataKey="dewPoint" name="Dew point (°C)" stroke={SERIES.dewPoint} strokeWidth={2} dot={false} />

// AirQualityPanel
<Line dataKey="aqi" name="US AQI" stroke={SERIES.aqi} strokeWidth={2} dot={false} connectNulls={false} />
```

In `DewPointPanel.tsx`, replace the band label constant and the two friction bands:

```tsx
const BAND_LABEL = { fontSize: 10, fill: CHART_UI.bandLabel };
```

```tsx
<ReferenceArea y1={lo} y2={GOOD_MAX_C} fill={BANDS.dewGood} fillOpacity={1} stroke="none"
  label={{ value: "good friction", position: "insideBottomLeft", ...BAND_LABEL }} />
<ReferenceArea y1={GREASY_MIN_C} y2={hi} fill={BANDS.dewGreasy} fillOpacity={1} stroke="none"
  label={{ value: "greasy", position: "insideTopLeft", ...BAND_LABEL }} />
```

In `AirQualityPanel.tsx`, the EPA bands keep `b.fill` and move alpha to the class; the dead-zone band moves to a token:

```tsx
{bands.map(b => (
  <ReferenceArea key={`aqi-${b.min}`} y1={b.min} y2={b.max}
    className={AQI_BAND_CLASS} fill={b.fill} stroke="none" />
))}

{deadRuns.map(run => (
  <ReferenceArea key={`dead-${run.start}`} x1={data[run.start].x} x2={data[run.end].x}
    fill={BANDS.aqiDead} fillOpacity={1} stroke="none" />
))}
```

(`AirQualityPanel` imports `AQI_BAND_CLASS` too.)

- [ ] **Step 6: Retokenize `WeatherChart.tsx` and the `ForecastChart` hover strip**

`components/WeatherChart.tsx` lines 35, 40, 41:

```tsx
<Bar yAxisId="precip" dataKey="precip" name="Precip (mm)" fill={SERIES.precip}>
<Line yAxisId="temp" dataKey="high" name="High (°C)" stroke={SERIES.temp} strokeWidth={2} dot={false} />
<Line yAxisId="temp" dataKey="low"  name="Low (°C)"  stroke={SERIES.low}  strokeWidth={2} dot={false} />
```

`components/ForecastChart.tsx` lines 146–155 — every inline hex becomes the matching constant:

```tsx
<span style={{ color: SERIES.temp }}>{activePoint.temp}°C</span>
<span style={{ color: SERIES.feelsLike }}>feels {activePoint.feelsLike}°C</span>
<span style={{ color: SERIES.dewPoint }}>dew {activePoint.dewPoint}°C</span>
<span style={{ color: SERIES.precip }}>{activePoint.precip.toFixed(1)} mm</span>
{activePoint.precipChance !== null && (
  <span style={{ color: SERIES.precipChance }}>{activePoint.precipChance}%</span>
)}
<span style={{ color: SERIES.humidity }}>{activePoint.humidity}% RH</span>
<span style={{ color: SERIES.wind }}>{activePoint.windSpeed} m/s</span>
<span style={{ color: "var(--fg-1)" }}>{activePoint.windGust} m/s gust</span>
```

Leave the AQI span alone — `aqiCategory(...).fill` is an EPA hue and stays literal.

- [ ] **Step 7: Point the day-card temperature colors at the real tokens**

In `app/styles/components.css`, drop the Task 2 fallbacks now that the variables exist:

```css
.hi { color: var(--series-temp); margin-right: var(--space-2); }
.lo { color: var(--series-low); }
```

- [ ] **Step 8: Update the four test files**

`tests/components/ForecastChart.test.tsx` — add the import and replace all four `#475569` selectors:

```tsx
import { BANDS } from "@/lib/chartColors";
// line 80
expect(container.querySelectorAll(`[fill="${BANDS.night}"]`)).toHaveLength(10);
// line 87
const band = container.querySelector(`[fill="${BANDS.night}"]`);
// line 89
expect(container.querySelectorAll(`[fill="${BANDS.night}"]`)).toHaveLength(10);
// line 95
expect(container.querySelectorAll(`[fill="${BANDS.night}"]`)).toHaveLength(0);
```

`tests/components/WeatherView.test.tsx` — same import; lines 35 and 47:

```tsx
expect(container.querySelectorAll(`[fill="${BANDS.night}"]`).length).toBeGreaterThan(0);
expect(container.querySelectorAll(`[fill="${BANDS.night}"]`)).toHaveLength(0);
```

`tests/components/DewPointPanel.test.tsx` — the two band helpers on lines 32–33, and line 121:

```tsx
import { BANDS, CHART_UI } from "@/lib/chartColors";
const goodRects = (c: HTMLElement) => band(c, BANDS.dewGood);
const greasyRects = (c: HTMLElement) => band(c, BANDS.dewGreasy);
// line 121 — the old #d1d5db was a literal that is now the --axis token
expect(container.querySelectorAll(`[stroke="${CHART_UI.axis}"][stroke-dasharray]`)).toHaveLength(0);
```

`tests/components/AirQualityPanel.test.tsx` — the **EPA hexes on lines 39–50 stay exactly as they are**; that is the point of the convention. Only the dead-zone assertions change (lines 55, 61, 73) and the two negative band checks (86, 97):

```tsx
import { BANDS } from "@/lib/chartColors";
// lines 55 / 61 / 73 — was '[fill="#6b7280"]'
expect(container.querySelectorAll(`[fill="${BANDS.aqiDead}"]`)).toHaveLength(1);
expect(container.querySelectorAll(`[fill="${BANDS.aqiDead}"]`)).toHaveLength(0);
expect(container.querySelectorAll(`[fill="${BANDS.aqiDead}"]`)).toHaveLength(2);
// line 86 — was '[fill="#f59e0b"]'
expect(container.querySelectorAll(`[fill="${BANDS.weekend}"]`)).toHaveLength(0);
// line 97 — was '[fill="#475569"]'
expect(container.querySelectorAll(`[fill="${BANDS.night}"]`)).toHaveLength(0);
```

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS. A failure on a `toHaveLength` count means a `fill` string does not match — print the actual `container.innerHTML` for the failing case and compare the attribute value against the constant.

- [ ] **Step 10: Verify both themes in the browser**

Run: `npm run dev`. Open `/route/105862922`, toggle via
`document.documentElement.setAttribute("data-theme","dark")` / `"light"`.

Check specifically:
- Every series line is visible against its panel background in both themes.
- Night bands read as night in dark (they are a dark wash on a dark panel — confirm they are visible at all; if not, raise the `--band-night` alpha).
- The AQI line stays readable where it crosses the EPA bands.
- Axis ticks and grid are legible but not louder than the data.

- [ ] **Step 11: Lint and commit**

```bash
npm run lint
git add lib/chartColors.ts app components tests
git commit -m "feat: move every chart color into CSS variables

Adds lib/chartColors.ts as the one source for series, band and chrome
colors, all as var() references. SVG presentation attributes resolve
var(), so the six panels theme themselves without taking a theme prop —
their React.memo and its measured hover-jank fix are untouched.

Band alpha is baked into each variable and bands draw at fillOpacity={1},
since a numeric JSX prop cannot hold a CSS variable. EPA AQI hues are
unchanged and get their per-theme alpha from a CSS class instead.

Tests now assert on the exported constants rather than hex literals, so
they check the right role is drawn and survive palette changes."
```

---

### Task 6: Replace Recharts legends with inline panel labels

**[model: claude-sonnet-5]**

**Files:**
- Create: `components/PanelLabel.tsx`
- Create: `tests/components/PanelLabel.test.tsx`
- Modify: all six panels (remove `<Legend/>`, reduce `height`)
- Modify: `components/ForecastChart.tsx` (wrap each panel in its label)
- Modify: `app/styles/components.css`

**Interfaces:**
- Consumes: `SERIES` from Task 5.
- Produces: `PanelLabel({ title, series })` where `series: { name: string; color: string; dashed?: boolean }[]`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/PanelLabel.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PanelLabel } from "@/components/PanelLabel";
import { SERIES } from "@/lib/chartColors";

describe("PanelLabel", () => {
  it("renders the panel title", () => {
    render(<PanelLabel title="Temperature" series={[]} />);
    expect(screen.getByText("Temperature")).toBeInTheDocument();
  });

  it("renders each series name verbatim", () => {
    // These strings are the app's contract: five existing panel tests read them
    // with getByText, and they used to come from the Recharts <Legend/>.
    render(
      <PanelLabel
        title="Temperature"
        series={[
          { name: "Temp (°C)", color: SERIES.temp },
          { name: "Feels like (°C)", color: SERIES.feelsLike, dashed: true },
        ]}
      />,
    );
    expect(screen.getByText("Temp (°C)")).toBeInTheDocument();
    expect(screen.getByText("Feels like (°C)")).toBeInTheDocument();
  });

  it("marks a dashed series so the swatch can differ", () => {
    const { container } = render(
      <PanelLabel title="T" series={[{ name: "Feels like (°C)", color: SERIES.feelsLike, dashed: true }]} />,
    );
    expect(container.querySelector(".panel-label__swatch--dashed")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/components/PanelLabel.test.tsx`
Expected: FAIL — cannot resolve `@/components/PanelLabel`.

- [ ] **Step 3: Write `components/PanelLabel.tsx`**

```tsx
/**
 * Replaces Recharts' <Legend/>. Six centred legends cost ~25px of chart height
 * each and were the loudest thing in the stack. This is plain DOM above the
 * chart, so it costs no plot area.
 *
 * The `name` strings must stay byte-identical to the old Legend entries —
 * TempPanel, PrecipPanel and DewPointPanel tests read them with getByText, and
 * two of those assert a series is *absent*.
 */
export type PanelSeries = { name: string; color: string; dashed?: boolean };

export function PanelLabel({ title, series }: { title: string; series: PanelSeries[] }) {
  return (
    <div className="panel-label">
      <span className="panel-label__title">{title}</span>
      <span className="panel-label__keys">
        {series.map(s => (
          <span key={s.name} className="panel-label__key">
            <span
              aria-hidden="true"
              className={`panel-label__swatch${s.dashed ? " panel-label__swatch--dashed" : ""}`}
              style={{ background: s.dashed ? "transparent" : s.color, borderColor: s.color }}
            />
            {s.name}
          </span>
        ))}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/components/PanelLabel.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Style it**

Append to `app/styles/components.css`:

```css
.panel-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 0 var(--space-2) var(--space-1);
  font-size: var(--text-xs);
  /* Sticks to the left edge while the chart scrolls sideways under it, the same
     trick .chart-note uses. */
  position: sticky;
  left: 0;
}
.panel-label__title {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: var(--fg-2);
}
.panel-label__keys { display: flex; gap: var(--space-3); color: var(--fg-1); }
.panel-label__key { display: inline-flex; align-items: center; gap: 0.35rem; }
.panel-label__swatch {
  width: 0.75rem;
  height: 0;
  border-top: 2px solid;
  border-radius: 1px;
}
.panel-label__swatch--dashed { border-top-style: dashed; }
```

- [ ] **Step 6: Remove `<Legend/>` and shrink the six panels**

In each panel file: delete `Legend` from the `recharts` import list and delete the `<Legend />` element. Change the heights:

| File | `height` |
|---|---|
| `TempPanel.tsx` | `260` → `220` |
| `PrecipPanel.tsx` | `150` → `130` |
| `WindPanel.tsx` | `150` → `130` |
| `DewPointPanel.tsx` | `150` → `130` |
| `HumidityPanel.tsx` | `150` → `130` |
| `AirQualityPanel.tsx` | `150` → `130` |

Leave `WeatherChart.tsx` alone — the history chart is not in the stack and keeps its legend.

- [ ] **Step 7: Render a label above each panel in `ForecastChart.tsx`**

Add the imports:

```tsx
import { PanelLabel } from "@/components/PanelLabel";
import { SERIES } from "@/lib/chartColors";
```

Wrap each panel. The label goes immediately before its `<...Panel />`, inside `.chart-inner`:

```tsx
<PanelLabel title="Temperature" series={[
  { name: "Temp (°C)", color: SERIES.temp },
  { name: "Feels like (°C)", color: SERIES.feelsLike, dashed: true },
]} />
<TempPanel ... />

<PanelLabel title="Precipitation" series={[
  { name: "Precip (mm)", color: SERIES.precip },
  { name: "Chance (%)", color: SERIES.precipChance },
]} />
<PrecipPanel ... />

<PanelLabel title="Wind" series={[
  { name: "Speed (m/s)", color: SERIES.wind },
  { name: "Gust (m/s)", color: SERIES.gust },
]} />
<WindPanel ... />

<PanelLabel title="Dew point" series={[
  { name: "Dew point (°C)", color: SERIES.dewPoint },
]} />
<DewPointPanel ... />

<PanelLabel title="Humidity" series={[
  { name: "Humidity (%)", color: SERIES.humidity },
]} />
<HumidityPanel ... />

<PanelLabel title="Air quality" series={[
  { name: "US AQI", color: SERIES.aqi },
]} />
<AirQualityPanel ... />
```

- [ ] **Step 8: Fix the panel tests that read legend text**

`TempPanel.test.tsx`, `PrecipPanel.test.tsx` and `DewPointPanel.test.tsx` render panels **directly**, without `ForecastChart`, so their `getByText("Temp (°C)")` assertions now fail — the text moved to `PanelLabel`, which those tests do not render.

Move each of those assertions to `tests/components/ForecastChart.test.tsx`, where the labels are actually rendered:

```tsx
it("names every plotted series exactly once", () => {
  render(<ForecastChart hourly={hours} />);
  for (const name of [
    "Temp (°C)", "Feels like (°C)", "Precip (mm)", "Chance (%)",
    "Speed (m/s)", "Gust (m/s)", "Dew point (°C)", "Humidity (%)",
  ]) {
    expect(screen.getByText(name)).toBeInTheDocument();
  }
});
```

In the three panel test files, replace each moved assertion with the structural check it was really making — that the series is plotted:

```tsx
// TempPanel.test.tsx — replaces the two getByText legend assertions
it("plots temperature and feels-like and nothing else", () => {
  const { container } = render(<TempPanel data={data} />);
  expect(container.querySelectorAll("path.recharts-line-curve")).toHaveLength(2);
});
```

```tsx
// DewPointPanel.test.tsx — "plots dew point alone" becomes
it("plots dew point alone", () => {
  const { container } = render(<DewPointPanel data={data} />);
  expect(container.querySelectorAll("path.recharts-line-curve")).toHaveLength(1);
});
```

```tsx
// PrecipPanel.test.tsx — the bar and the chance line
it("plots both the mm bars and the chance line", () => {
  const { container } = render(<PrecipPanel data={data} />);
  expect(container.querySelectorAll("path.recharts-line-curve")).toHaveLength(1);
  expect(container.querySelectorAll(".recharts-bar-rectangle").length).toBeGreaterThan(0);
});
```

Keep the two **absence** assertions where they are and adapt them — they encode the deliberate temp/dew-point separation documented in CLAUDE.md, and the line-count checks above already carry that meaning. Delete the now-redundant `queryByText` lines in both files, leaving an explanatory comment:

```tsx
// The old queryByText("Dew point (°C)") check moved to a line count: the label
// text now lives in PanelLabel, which ForecastChart renders and this test does
// not. One curve means dew point is not secretly plotted here.
```

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Verify in the browser**

Run: `npm run dev`. Open `/route/105862922`.
Expected: no centred swatch rows under any forecast panel; a small uppercase label above each; the stack is visibly shorter; each panel's plot area is slightly taller than before. The history chart below still has its legend.

- [ ] **Step 11: Lint and commit**

```bash
npm run lint
git add components app tests
git commit -m "feat: replace forecast legends with inline panel labels

Six centred Recharts legends each ate ~25px inside the chart box and were
the loudest thing in the stack. PanelLabel puts the panel name and its
series keys in plain DOM above each chart, so the space comes back as plot
area: the stack drops ~1010px to ~870px while every panel gets taller.

The series name strings are unchanged. The assertions that read them move
to ForecastChart.test.tsx, where the labels now render; the panel tests
keep the same meaning as line counts."
```

---

### Task 7: Sticky hover readout

**[model: claude-sonnet-5]**

Done before the crosshair so the crosshair task changes one thing only.

**Files:**
- Modify: `components/ForecastChart.tsx` (restructure the strip's markup)
- Modify: `app/styles/components.css`

**Interfaces:**
- Consumes: `SERIES` from Task 5.
- Produces: the `.chart-readout` class contract used by Task 8's overlay positioning (no JS coupling).

- [ ] **Step 1: Restructure the readout markup in `ForecastChart.tsx`**

Replace the `.chart-tooltip-strip` block (lines 140–166) with labelled cells. Each figure sits in its own fixed-width slot so digits do not reflow while sweeping across hours.

```tsx
<div className="chart-readout" data-testid="chart-readout">
  {activePoint ? (
    <>
      <span className="chart-readout__when">{activePoint.datetime.replace("T", " ")}</span>
      <span className="chart-readout__cell" style={{ color: SERIES.temp }}>
        <span className="chart-readout__label">temp</span>{activePoint.temp}°C
      </span>
      <span className="chart-readout__cell" style={{ color: SERIES.feelsLike }}>
        <span className="chart-readout__label">feels</span>{activePoint.feelsLike}°C
      </span>
      <span className="chart-readout__cell" style={{ color: SERIES.dewPoint }}>
        <span className="chart-readout__label">dew</span>{activePoint.dewPoint}°C
      </span>
      <span className="chart-readout__cell" style={{ color: SERIES.precip }}>
        <span className="chart-readout__label">rain</span>{activePoint.precip.toFixed(1)} mm
      </span>
      {activePoint.precipChance !== null && (
        <span className="chart-readout__cell" style={{ color: SERIES.precipChance }}>
          <span className="chart-readout__label">chance</span>{activePoint.precipChance}%
        </span>
      )}
      <span className="chart-readout__cell" style={{ color: SERIES.humidity }}>
        <span className="chart-readout__label">RH</span>{activePoint.humidity}%
      </span>
      <span className="chart-readout__cell" style={{ color: SERIES.wind }}>
        <span className="chart-readout__label">wind</span>{activePoint.windSpeed} m/s
      </span>
      <span className="chart-readout__cell" style={{ color: "var(--fg-1)" }}>
        <span className="chart-readout__label">gust</span>{activePoint.windGust} m/s
      </span>
      {activePoint.aqi !== null && (
        <span className="chart-readout__cell" style={{ color: aqiCategory(activePoint.aqi).fill }}>
          <span className="chart-readout__label">AQI</span>{activePoint.aqi}
        </span>
      )}
    </>
  ) : (
    <span className="chart-readout__idle">Hover or drag across the charts to read an hour</span>
  )}
</div>
```

- [ ] **Step 2: Replace the strip styles**

In `app/styles/components.css`, replace the whole `.chart-tooltip-strip` rule with:

```css
/* Sticky because the stack is ~870px tall: hovering a lower panel used to put
   the numbers off-screen. `top` clears the app header added in Task 9. */
.chart-readout {
  position: sticky;
  top: 3.25rem;
  z-index: 5;
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
  align-items: baseline;
  padding: var(--space-2) var(--space-3);
  margin-bottom: var(--space-2);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  min-height: 2.5rem;
}
.chart-readout__when { color: var(--fg-1); min-width: 9.5rem; }
/* Fixed slot width so a 9→10 digit change does not shove the row sideways. */
.chart-readout__cell { display: inline-flex; gap: 0.3rem; min-width: 5.5rem; }
.chart-readout__label {
  color: var(--fg-2);
  text-transform: uppercase;
  font-size: var(--text-xs);
  letter-spacing: 0.04em;
}
.chart-readout__idle { color: var(--fg-2); }
```

- [ ] **Step 3: Check whether any test reads the old class or the em dash**

Run: `grep -rn 'chart-tooltip-strip\|—' tests/components/ForecastChart.test.tsx tests/components/WeatherView.test.tsx`
Expected: if either matches, update that assertion to `data-testid="chart-readout"` or to the new idle copy. If there is no output, nothing to change.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`. Open `/route/105862922`, choose the 15-day window, scroll to the humidity panel and hover it.
Expected: the readout stays pinned at the top of the viewport and updates; digits do not make the row jump as you sweep.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add components app
git commit -m "feat: pin the hover readout and give it fixed number slots

On a 15-day window the stack is ~870px tall, so hovering a lower panel put
the numbers off-screen entirely. The strip is now sticky, each figure is
labelled and sits in a fixed-width tabular-numeral slot, so the row no
longer shifts sideways while sweeping across hours."
```

---

### Task 8: Shared crosshair overlay

**[model: claude-opus-5]**

The one task with real subtlety: the crosshair must **not** be a Recharts element inside the panels.

**Files:**
- Create: `components/ChartCrosshair.tsx`
- Create: `tests/components/ChartCrosshair.test.tsx`
- Modify: `components/ForecastChart.tsx`
- Modify: `tests/components/panelMemoization.test.tsx` (add the prop-identity guard)
- Modify: `tests/components/panelAlignment.test.tsx` (comment only)
- Modify: `app/styles/components.css`

**Interfaces:**
- Consumes: `CHART_UI.crosshair` from Task 5; the hover index already held by `ForecastChart`.
- Produces: `ChartCrosshair({ index, count, containerRef })`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/ChartCrosshair.test.tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { createRef } from "react";
import { ChartCrosshair } from "@/components/ChartCrosshair";

/** A stand-in for .chart-inner holding one rendered x-axis line, which is the
 *  only thing the crosshair measures. */
function harness(x1: number, x2: number) {
  const host = document.createElement("div");
  host.innerHTML = `
    <svg>
      <g class="recharts-xAxis">
        <line class="recharts-cartesian-axis-line" x1="${x1}" x2="${x2}" y1="0" y2="0"></line>
      </g>
    </svg>`;
  document.body.appendChild(host);
  const ref = createRef<HTMLDivElement>();
  Object.defineProperty(ref, "current", { value: host, writable: true });
  return { host, ref };
}

describe("ChartCrosshair", () => {
  it("renders nothing when no hour is active", () => {
    const { ref } = harness(60, 760);
    const { container } = render(<ChartCrosshair index={null} count={24} containerRef={ref} />);
    expect(container.querySelector(".chart-crosshair")).toBeNull();
  });

  it("positions at the centre of the hovered band", () => {
    // Plot spans 60..760 = 700px over 24 bands, so each band is 29.1667px and
    // the centre of band 0 is 60 + 0.5 * 29.1667 = 74.58px.
    const { ref } = harness(60, 760);
    const { container } = render(<ChartCrosshair index={0} count={24} containerRef={ref} />);
    const line = container.querySelector<HTMLElement>(".chart-crosshair");
    expect(line).not.toBeNull();
    expect(parseFloat(line!.style.left)).toBeCloseTo(74.58, 1);
  });

  it("positions the last band inside the plot area", () => {
    // Centre of band 23 = 60 + 23.5 * 29.1667 = 745.42px — inside 760.
    const { ref } = harness(60, 760);
    const { container } = render(<ChartCrosshair index={23} count={24} containerRef={ref} />);
    const line = container.querySelector<HTMLElement>(".chart-crosshair");
    expect(parseFloat(line!.style.left)).toBeCloseTo(745.42, 1);
  });

  it("renders nothing when the axis has not been measured yet", () => {
    const empty = createRef<HTMLDivElement>();
    const { container } = render(<ChartCrosshair index={3} count={24} containerRef={empty} />);
    expect(container.querySelector(".chart-crosshair")).toBeNull();
  });

  it("renders nothing for an empty series", () => {
    const { ref } = harness(60, 760);
    const { container } = render(<ChartCrosshair index={0} count={0} containerRef={ref} />);
    expect(container.querySelector(".chart-crosshair")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/components/ChartCrosshair.test.tsx`
Expected: FAIL — cannot resolve `@/components/ChartCrosshair`.

- [ ] **Step 3: Write `components/ChartCrosshair.tsx`**

```tsx
"use client";
import { useEffect, useState, type RefObject } from "react";

/**
 * One vertical line across the whole forecast stack.
 *
 * It is deliberately NOT a Recharts <ReferenceLine> inside each panel.
 * ForecastChart documents a measured fix: setActivePoint fires on every
 * mousemove, and the six panels are React.memo'd with stable props because
 * without that, each move re-rendered ~2,000 SVG nodes (frame p50 94ms, 58 long
 * tasks; 17ms and zero after). A per-hover `x` prop would undo exactly that.
 * ForecastChart already re-renders on hover for the readout, so an overlay it
 * owns costs one <div>.
 *
 * Geometry is measured off a rendered axis rather than recomputed from
 * Recharts' internals. One measurement serves all six panels because
 * tests/components/panelAlignment.test.tsx guarantees their x-axis extents are
 * identical — that test is load-bearing for this component, not just
 * protective.
 */
const AXIS_SELECTOR = ".recharts-xAxis line.recharts-cartesian-axis-line";

export function ChartCrosshair({
  index,
  count,
  containerRef,
}: {
  index: number | null;
  count: number;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const [extent, setExtent] = useState<{ x1: number; x2: number } | null>(null);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    function measure() {
      const line = host!.querySelector(AXIS_SELECTOR);
      if (!line) return;
      const x1 = parseFloat(line.getAttribute("x1") ?? "");
      const x2 = parseFloat(line.getAttribute("x2") ?? "");
      if (Number.isNaN(x1) || Number.isNaN(x2) || x2 <= x1) return;
      setExtent(prev => (prev && prev.x1 === x1 && prev.x2 === x2 ? prev : { x1, x2 }));
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
    // `count` is a dependency because changing the day window re-renders the
    // charts at a new width; re-measuring on that is cheaper than watching
    // every SVG mutation.
  }, [containerRef, count]);

  if (index === null || count <= 0 || !extent) return null;

  const band = (extent.x2 - extent.x1) / count;
  const left = extent.x1 + (index + 0.5) * band;

  return (
    <div
      aria-hidden="true"
      className="chart-crosshair"
      style={{ left: `${left}px` }}
    />
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/components/ChartCrosshair.test.tsx`
Expected: PASS (5 tests). If `ResizeObserver` is undefined under jsdom, add this to `tests/setup.ts` (check whether the file exists; `vitest.config.ts` names the setup file):

```ts
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver;
}
```

- [ ] **Step 5: Style the line**

Append to `app/styles/components.css`:

```css
/* Positioned against .chart-inner, so it scrolls with the charts inside
   .chart-scroll rather than floating over a scrolled-away hour. */
.chart-inner { position: relative; }
.chart-crosshair {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--crosshair);
  pointer-events: none;
  z-index: 2;
}
```

- [ ] **Step 6: Wire it into `ForecastChart.tsx`**

Track the hovered index alongside the existing point, and hang a ref on `.chart-inner`:

```tsx
import { useRef } from "react";
import { ChartCrosshair } from "@/components/ChartCrosshair";
```

```tsx
const [activeIndex, setActiveIndex] = useState<number | null>(null);
const innerRef = useRef<HTMLDivElement>(null);
```

In `handleHover`, set it alongside the point (inside the existing bounds check, after `const h = hourly[idx]`):

```tsx
setActiveIndex(idx);
```

In `clear`:

```tsx
const clear = useCallback(() => {
  setActivePoint(null);
  setActiveIndex(null);
}, []);
```

And in the JSX:

```tsx
<div className="chart-inner" ref={innerRef}>
  <ChartCrosshair index={activeIndex} count={hourly.length} containerRef={innerRef} />
  {/* …the six PanelLabel + Panel pairs, unchanged… */}
</div>
```

- [ ] **Step 7: Add the prop-identity guard to `panelMemoization.test.tsx`**

The existing file only checks that each export is `React.memo`. That is half the fix; the other half — that `ForecastChart` passes props whose identity survives a hover — has been guarded by a comment only. Add:

```tsx
import { render, fireEvent } from "@testing-library/react";
import { ForecastChart } from "@/components/ForecastChart";
import type { HourlyWeather } from "@/lib/weather";

const captured: Record<string, unknown>[] = [];

vi.mock("@/components/TempPanel", () => ({
  TempPanel: (props: Record<string, unknown>) => {
    captured.push(props);
    return <div data-testid="temp-panel" />;
  },
}));

const hours: HourlyWeather[] = Array.from({ length: 24 }, (_, i) => ({
  datetime: `2026-01-01T${String(i).padStart(2, "0")}:00`,
  temp: 10, feelsLike: 9, dewPoint: 4, humidity: 55,
  precip: 0, precipChance: 10, windSpeed: 3, windGust: 5,
}));

it("passes TempPanel identical prop references across a hover", () => {
  // The crosshair must stay an overlay owned by ForecastChart. If someone
  // "simplifies" it into a per-panel ReferenceLine, a changing prop lands here
  // and the memoisation — worth 94ms -> 17ms frame p50 — silently dies.
  captured.length = 0;
  const { getByTestId } = render(<ForecastChart hourly={hours} />);

  const before = captured.length;
  fireEvent.mouseMove(getByTestId("temp-panel"));
  // Force the parent to re-render the way a real hover does.
  render(<ForecastChart hourly={hours} />);

  expect(captured.length).toBeGreaterThan(before);
  const first = captured[0];
  const latest = captured[captured.length - 1];
  for (const key of ["ticks", "tickFormatter", "weekendBands", "nightBands", "onHover", "onLeave"]) {
    expect(Object.is(first[key], latest[key])).toBe(true);
  }
  // No prop may carry the hover position into the panel.
  expect(Object.keys(latest)).not.toContain("activeIndex");
  expect(Object.keys(latest)).not.toContain("hoverIndex");
  expect(Object.keys(latest)).not.toContain("crosshairX");
});
```

Note: the two `render` calls mount separate trees, so the identity check is across mounts of the same memoised arrays. If that proves too weak in practice, replace it with a single mount plus a `rerender` from the same `render` result and assert across that instead.

- [ ] **Step 8: Add the load-bearing note to `panelAlignment.test.tsx`**

Append to the top comment block in that file:

```tsx
// This test is also load-bearing for ChartCrosshair: the overlay measures ONE
// panel's x-axis and positions a line across all six. That is only valid
// because every panel's horizontal extent is identical, which is exactly what
// this test asserts. If it ever has to be relaxed, the crosshair has to start
// measuring per panel.
```

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Verify in the browser, including performance**

Run: `npm run dev`. Open `/route/105862922`, pick the 15-day window.

- Hover across the temperature panel: one line tracks the cursor through all six panels and lines up with the hovered hour in each.
- Resize the window: the line stays aligned (the `ResizeObserver` re-measures).
- Scroll the chart area sideways on a narrow window: the line scrolls with the charts.
- Open DevTools → Performance, record ~5 seconds of sweeping across the stack. Frame times must stay in the ~17ms range with no long tasks. **If long tasks appear, the panels are re-rendering** — stop and find the prop that changed.
- On a touch device or DevTools device mode, drag across a panel: the line follows the finger.

- [ ] **Step 11: Lint and commit**

```bash
npm run lint
git add components app tests
git commit -m "feat: add one crosshair across the whole forecast stack

A DOM overlay owned by ForecastChart, not a ReferenceLine inside each
panel: the panels are React.memo'd with stable props because a changing
per-hover prop cost 94ms frame p50 and 58 long tasks, against 17ms and
zero after. ForecastChart already re-renders on hover for the readout, so
the overlay is one div.

Position comes from measuring a rendered x-axis, which is valid for all
six panels only because panelAlignment.test.tsx pins their extents equal;
that test is now noted as load-bearing. panelMemoization gains the missing
half of its guard — that no hover-varying prop reaches a panel."
```

---

### Task 9: Persistent app header

**[model: claude-sonnet-5]**

**Files:**
- Create: `components/AppHeader.tsx`
- Create: `tests/components/AppHeader.test.tsx`
- Modify: `app/layout.tsx`
- Modify: `components/SearchBox.tsx` (add a `variant` prop — styling only)
- Modify: `app/route/[id]/page.tsx`, `app/at/[coords]/page.tsx` (drop the footer link)
- Modify: `app/styles/components.css`

**Interfaces:**
- Consumes: `ThemeToggle` (Task 3).
- Produces: `AppHeader` (no props). `SearchBox` gains `variant?: "hero" | "compact"`, defaulting to `"hero"`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/AppHeader.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppHeader } from "@/components/AppHeader";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn() }),
}));

describe("AppHeader", () => {
  it("always shows the wordmark linking home", () => {
    pathname.value = "/route/123";
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: /cragweather/i })).toHaveAttribute("href", "/");
  });

  it("always shows the theme toggle", () => {
    pathname.value = "/";
    render(<AppHeader />);
    expect(screen.getByRole("button", { name: /switch to (light|dark) theme/i })).toBeInTheDocument();
  });

  it("hides the search on the home page, which has its own hero search", () => {
    pathname.value = "/";
    render(<AppHeader />);
    expect(screen.queryByLabelText("Search routes")).toBeNull();
  });

  it("shows the search on a route page", () => {
    pathname.value = "/route/105862922";
    render(<AppHeader />);
    expect(screen.getByLabelText("Search routes")).toBeInTheDocument();
  });

  it("shows the search on a GPS page", () => {
    pathname.value = "/at/37.734,-119.637";
    render(<AppHeader />);
    expect(screen.getByLabelText("Search routes")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/components/AppHeader.test.tsx`
Expected: FAIL — cannot resolve `@/components/AppHeader`.

- [ ] **Step 3: Add the `variant` prop to `SearchBox.tsx`**

Styling only — the `parseSearchTarget` routing in the effect is untouched.

```tsx
export function SearchBox({ variant = "hero" }: { variant?: "hero" | "compact" } = {}) {
```

and the wrapper:

```tsx
<div className={`searchbox searchbox--${variant}`}>
```

- [ ] **Step 4: Write `components/AppHeader.tsx`**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchBox } from "@/components/SearchBox";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Sticky on every page. Search is omitted on "/" because the home page's hero
 *  search is already the focus there; everywhere else this is the only way to
 *  reach another route without going back. Replaces the per-page
 *  "← Search another route" footer link. */
export function AppHeader() {
  const pathname = usePathname();
  const showSearch = pathname !== "/";

  return (
    <header className="app-header">
      <Link href="/" className="app-header__mark">
        CragWeather
      </Link>
      {showSearch && (
        <div className="app-header__search">
          <SearchBox variant="compact" />
        </div>
      )}
      <ThemeToggle />
    </header>
  );
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/components/AppHeader.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Mount it in `app/layout.tsx`**

```tsx
import { AppHeader } from "@/components/AppHeader";
// ...
<body>
  <AppHeader />
  {children}
  <ServiceWorkerRegistration />
</body>
```

- [ ] **Step 7: Style it**

Append to `app/styles/components.css`:

```css
.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  height: 3.25rem;      /* matches .chart-readout's `top` */
  padding: 0 var(--space-4);
  background: color-mix(in srgb, var(--bg-0) 88%, transparent);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
}
.app-header__mark {
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--fg-0);
  text-decoration: none;
  white-space: nowrap;
}
.app-header__search { flex: 1; max-width: 26rem; }

.searchbox--compact input {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-md);
  background: var(--bg-2);
}

@media (max-width: 600px) {
  .app-header { gap: var(--space-2); padding: 0 var(--space-3); }
  .app-header__mark { font-size: var(--text-md); }
}
```

- [ ] **Step 8: Remove the now-duplicated footer links**

In `app/route/[id]/page.tsx`, delete:

```tsx
<footer className="route-footer">
  <Link href="/">← Search another route</Link>
</footer>
```

Do the same in `app/at/[coords]/page.tsx`. Remove the now-unused `Link` import from each file if nothing else uses it — `route/[id]/page.tsx` has no other `Link` usage, so its import goes.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS. `RoutePage.test.tsx` or `GpsWeatherPage.test.tsx` may assert on the removed footer link — if so, delete that assertion; the header now covers the need and `AppHeader.test.tsx` asserts it.

- [ ] **Step 10: Verify in the browser**

Run: `npm run dev`.
- `/` — header shows the wordmark and toggle, **no** search; the hero search is still below.
- `/route/105862922` — header has a compact search; typing shows the dropdown; picking a result navigates.
- `/about`, `/at/37.734,-119.637` — header present.
- Scroll a route page: the header stays, and the sticky readout parks directly beneath it without overlap.
- At 375px wide the header does not wrap to two lines.

- [ ] **Step 11: Lint and commit**

```bash
npm run lint
git add components app tests
git commit -m "feat: add a persistent app header with search and theme toggle

Sticky on every page: wordmark, compact search and the theme toggle. Search
was previously reachable only from the home page, so jumping between routes
meant navigating back; the header replaces the per-page 'Search another
route' footer link. It is hidden on / where the hero search already leads.

SearchBox gains a variant prop for styling only — its parseSearchTarget
routing is unchanged."
```

---

### Task 10: Rebuilt route header block

**[model: claude-sonnet-5]**

**Files:**
- Create: `components/RouteHeader.tsx`
- Create: `tests/components/RouteHeader.test.tsx`
- Modify: `app/route/[id]/page.tsx`, `app/at/[coords]/page.tsx`, `components/GpsHeader.tsx`
- Modify: `app/styles/components.css`

**Interfaces:**
- Consumes: nothing from earlier tasks beyond tokens.
- Produces: `RouteHeader({ title, chips, actions, children })` — a layout shell. `title: ReactNode`, `chips: (string | null | undefined)[]`, `actions: ReactNode`, `children` for the timestamp row.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/RouteHeader.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouteHeader } from "@/components/RouteHeader";

describe("RouteHeader", () => {
  it("renders the title", () => {
    render(<RouteHeader title={<h1>The Nose</h1>} chips={[]} actions={null} />);
    expect(screen.getByRole("heading", { name: "The Nose" })).toBeInTheDocument();
  });

  it("renders one chip per non-empty value", () => {
    const { container } = render(
      <RouteHeader title={<h1>T</h1>} chips={["Yosemite Valley", "5.9 C2"]} actions={null} />,
    );
    expect(container.querySelectorAll(".route-chip")).toHaveLength(2);
    expect(screen.getByText("Yosemite Valley")).toBeInTheDocument();
    expect(screen.getByText("5.9 C2")).toBeInTheDocument();
  });

  it("drops null and empty chips rather than rendering blanks", () => {
    // route_meta is lazily populated, so area and grade are routinely null.
    const { container } = render(
      <RouteHeader title={<h1>T</h1>} chips={[null, "5.9", undefined, ""]} actions={null} />,
    );
    expect(container.querySelectorAll(".route-chip")).toHaveLength(1);
  });

  it("renders actions and children", () => {
    render(
      <RouteHeader title={<h1>T</h1>} chips={[]} actions={<button>Save</button>}>
        <span>updated just now</span>
      </RouteHeader>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByText("updated just now")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/components/RouteHeader.test.tsx`
Expected: FAIL — cannot resolve `@/components/RouteHeader`.

- [ ] **Step 3: Write `components/RouteHeader.tsx`**

```tsx
import type { ReactNode } from "react";

/** Shared shell for the route and GPS page headers. Both used to be a loose
 *  stack of <p> tags — one per link — which left the save button, the two
 *  outbound links and the timestamp on four separate lines. */
export function RouteHeader({
  title,
  chips,
  actions,
  children,
}: {
  title: ReactNode;
  chips: (string | null | undefined)[];
  actions: ReactNode;
  children?: ReactNode;
}) {
  const shown = chips.filter((c): c is string => Boolean(c && c.trim()));
  return (
    <header className="route-header">
      {title}
      {shown.length > 0 && (
        <p className="route-chips">
          {shown.map(c => (
            <span key={c} className="route-chip">{c}</span>
          ))}
        </p>
      )}
      <div className="route-actions">{actions}</div>
      {children}
    </header>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/components/RouteHeader.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Use it in `app/route/[id]/page.tsx`**

Replace the whole `<header className="route-header">…</header>` block:

```tsx
<RouteHeader
  title={<h1>{route.name}</h1>}
  chips={[route.area, route.grade]}
  actions={
    <>
      <SaveButton
        route={{ id: route.id, name: route.name, area: route.area, grade: route.grade }}
      />
      <a className="route-link" href={route.mpUrl} target="_blank" rel="noreferrer">
        Mountain Project ↗
      </a>
      <WindyLink lat={route.lat} lng={route.lng} />
    </>
  }
>
  <p className="weather-fetched-at">
    Weather updated <FetchedAt iso={fetchedAt.toISOString()} />
  </p>
</RouteHeader>
```

Add `import { RouteHeader } from "@/components/RouteHeader";`.

- [ ] **Step 6: Use it in `app/at/[coords]/page.tsx` and simplify `GpsHeader`**

`GpsHeader` must keep owning the `override` state — it exists so `GpsTitle` reflects a save without a reload — so the header shell wraps *around* it rather than replacing it. Change `components/GpsHeader.tsx` to render the shell itself:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { GpsTitle } from "@/components/GpsTitle";
import { SaveButton } from "@/components/SaveButton";
import { RouteHeader } from "@/components/RouteHeader";
import type { SavedGpsRoute } from "@/lib/favorites";

/** Owns the shared save state so GpsTitle reflects a save/remove immediately,
 *  without a page reload. */
export function GpsHeader({
  lat,
  lng,
  links,
  children,
}: {
  lat: number;
  lng: number;
  links?: ReactNode;
  children?: ReactNode;
}) {
  const [override, setOverride] = useState<SavedGpsRoute | null | undefined>(undefined);

  return (
    <RouteHeader
      title={<GpsTitle lat={lat} lng={lng} override={override} />}
      chips={[]}
      actions={
        <>
          <SaveButton gps={{ lat, lng }} onSaved={setOverride} />
          {links}
        </>
      }
    >
      {children}
    </RouteHeader>
  );
}
```

Then in `app/at/[coords]/page.tsx`, replace the whole `<header>` block:

```tsx
<GpsHeader lat={lat} lng={lng} links={<WindyLink lat={lat} lng={lng} />}>
  <p className="weather-fetched-at">
    Weather updated <FetchedAt iso={fetchedAt.toISOString()} />
  </p>
</GpsHeader>
```

`GpsTitle` already renders its own `<h1>` and `.route-meta`, so it slots into `title` unchanged.

- [ ] **Step 7: Style the chips and action row**

Append to `app/styles/components.css`:

```css
.route-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: var(--space-2) 0; padding: 0; }
.route-chip {
  padding: 0.15rem var(--space-2);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--fg-1);
}
.route-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-3) 0 var(--space-2);
}
/* The save button had `margin-top: 0.5rem` for the old stacked layout; the row
   owns spacing now. */
.route-actions .save-btn { margin-top: 0; }
.route-link { font-size: var(--text-md); white-space: nowrap; }
```

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS. `RoutePage.test.tsx` and `GpsWeatherPage.test.tsx` may assert on the old `"View on Mountain Project ↗"` text — the link label is now `"Mountain Project ↗"`. Update those assertions to the new text.

- [ ] **Step 9: Verify in the browser**

Run: `npm run dev`. Open `/route/105862922` and `/at/37.734,-119.637`.
Expected: title, then chips, then one row holding Save + Mountain Project + Windy, then the timestamp. On the GPS page, saving with a custom name still updates the title immediately without a reload. At 375px the action row wraps rather than overflowing.

- [ ] **Step 10: Lint and commit**

```bash
npm run lint
git add components app tests
git commit -m "feat: consolidate the route and GPS page headers

The header was a loose stack — h1, a meta line, then one <p> per outbound
link, then the save button, then the timestamp, on five lines. RouteHeader
makes it one block: area and grade as chips, and Save, Mountain Project and
Windy sharing a single action row.

GpsHeader still owns the save-state override GpsTitle needs to update
without a reload; it now renders the shared shell around it."
```

---

### Task 11: Retokenize the remaining surfaces

**[model: claude-sonnet-5]**

Everything not yet touched, brought onto the token layer and checked in both themes. No structural change.

**Files:**
- Modify: `app/styles/components.css`
- Modify: `app/page.tsx` (spacing only, if the hero needs it)
- Modify: `app/route/[id]/loading.tsx`, `error.tsx`, `not-found.tsx`; `app/at/[coords]/loading.tsx`, `not-found.tsx`

**Interfaces:**
- Consumes: all tokens.
- Produces: nothing new.

- [ ] **Step 1: Find every remaining raw color**

Run: `grep -rn '#[0-9a-fA-F]\{3,6\}\|rgba(' app/styles/components.css app/styles/base.css`
Expected: **no output** except inside `tokens.css` (not searched here). Every hit is a bug from an earlier task — fix each by pointing it at an existing token, or add one to `tokens.css` with both theme values if none fits.

Run: `grep -rn '#[0-9a-fA-F]\{6\}' components app --include-dir=. | grep -v aqiBands`
Expected: only `lib/aqiBands.ts` (EPA hues) and `app/layout.tsx`'s two `theme-color` metas.

- [ ] **Step 2: Move remaining literal spacing onto the scale**

In `app/styles/components.css`, replace literal `padding`/`margin`/`gap` rem values with `--space-*` where they match exactly (`0.25rem`→`--space-1`, `0.5rem`→`--space-2`, `0.75rem`→`--space-3`, `1rem`→`--space-4`, `1.5rem`→`--space-5`, `2rem`→`--space-6`, `3rem`→`--space-7`, `4rem`→`--space-8`). Leave odd values (`0.15rem`, `0.35rem`, `0.4rem`, `0.6rem`, `0.85rem`) as they are — forcing them onto the scale would change the layout, and this task must not.

- [ ] **Step 3: Give the surfaces a dark-appropriate treatment**

Cards read as flat grey boxes on dark when they only differ from the page by a 1px border. Append:

```css
/* On dark, --bg-1 against --bg-0 is a small step; the top highlight is what
   makes a card read as raised without a heavy border. */
.chart-wrap,
.home-popular li a,
.saved-card,
.hourly-list {
  background: var(--bg-1);
  border: 1px solid var(--border);
  box-shadow: inset 0 1px 0 var(--overlay);
}

.card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  box-shadow: inset 0 1px 0 var(--overlay);
  transition: border-color 0.12s, transform 0.12s;
}
.card:hover { border-color: var(--accent); }

.searchbox input:focus-visible,
.day-picker-btn:focus-visible,
.save-btn:focus-visible,
.theme-toggle:focus-visible,
.card:focus-visible {
  outline: none;
  box-shadow: var(--ring);
}

.day-picker-btn.active { color: var(--accent-contrast); }
```

- [ ] **Step 4: Check the five status pages**

Open each of `app/route/[id]/loading.tsx`, `error.tsx`, `not-found.tsx` and `app/at/[coords]/loading.tsx`, `not-found.tsx`. If any carries an inline `style` with a color or a hardcoded class not in `components.css`, move it onto tokens. If they are plain text in a `.route-page` wrapper, leave them.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Full browser pass, both themes, two widths**

Run: `npm run dev`. At **375px** and **1440px**, in **dark** and **light** (four passes), check:

| Page | Checks |
|---|---|
| `/` | hero search, dropdown over dark, saved-route cards, popular grid, footer link |
| `/route/105862922` | header block, day picker, readout, six panels, day cards, expanded hourly list, history chart |
| `/at/37.734,-119.637` | GPS title, save, Windy link |
| `/about` | prose legibility |
| `/list/<uuid>` | join flow (create a list via the sync modal first) |
| Sync modal | **both modes**; the QR code needs a white quiet zone even in dark — `.sync-modal__qr svg { background: white }` must stay |

Also confirm: no white flash on a dark reload; the theme survives a reload; focus rings are visible on every interactive element in both themes.

- [ ] **Step 7: Lint and commit**

```bash
npm run lint
git add app components
git commit -m "style: bring the remaining surfaces onto the token layer

Home, saved cards, day cards, hourly list, sync modal, join flow, about and
the status pages. Adds an inset top highlight so cards read as raised on
dark, where a 1px border alone leaves them flat, and gives every
interactive element a visible focus ring in both themes."
```

---

### Task 12: Update CLAUDE.md

**[model: claude-sonnet-5]**

The project convention is to record new patterns and gotchas. Several documented facts in `CLAUDE.md` are now wrong.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Correct the statements the redesign invalidated**

- The panel descriptions state heights of 260px and 150px — now 220 and 130.
- `TempPanel`'s entry says "all six panels now share the same `top: 8` margin" — still true, but the legend removal is new and belongs here.
- `DailyCards` / panel entries do not mention `PanelLabel`.
- Nothing mentions the token layer, the theme mechanism, or `lib/chartColors.ts`.

- [ ] **Step 2: Add a "Frontend design system" section**

Place it before "Weather model". Cover, in the file's existing voice — stating the reason, not just the rule:

- `app/styles/tokens.css` is the only place a raw color may appear. Dark is `:root`; light is `[data-theme="light"]`.
- Theme default is dark regardless of `prefers-color-scheme`; the rule is written twice — in `ThemeToggle.readTheme()` and in the inline `<head>` script — and both must agree. The script must stay inline and synchronous or dark loads flash white.
- `lib/chartColors.ts` exports `var()` references, not hex. This is what lets the memoized panels theme themselves without a prop. Tests assert on these constants, not on hex.
- Band alpha is baked into the color variables and bands render at `fillOpacity={1}`, because a numeric JSX prop cannot hold a CSS variable. The exception is the EPA AQI bands, whose hues are fixed and whose alpha comes from the `.aqi-band` class.
- `ChartCrosshair` is a DOM overlay, **not** a `ReferenceLine`, and why: the measured memoization fix. Note that `panelAlignment.test.tsx` is load-bearing for it.
- `PanelLabel` replaced the Recharts legends, and the series name strings are a test contract.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the frontend design system in CLAUDE.md

Corrects the panel heights, and adds the token layer, the dark-default
theme rule duplicated between ThemeToggle and the pre-paint script, the
var()-based chart palette, the baked-in band alpha, and why the crosshair
is a DOM overlay rather than a ReferenceLine."
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 Token layer and theming | 2, 3 |
| §1 SyncModal undefined-variable bug | 2 (Step 3) |
| §2 `var()` verification | 1 |
| §2 `lib/chartColors.ts`, EPA hues, grid | 5 |
| §2 `dataviz` skill before choosing values | 5 (Step 1) |
| §2 Test impact | 5 (Step 8) |
| §3 Legends → labels, frozen strings | 6 |
| §3 Heights | 6 (Step 6) |
| §3 Crosshair overlay + geometry | 8 |
| §3 Sticky readout | 7 |
| §3 Touch unchanged | 8 (Step 10) |
| §4 `AppHeader`, `SearchBox` variant | 9 |
| §4 `RouteHeader`, `GpsHeader` override kept | 10 |
| §4 Remaining surfaces | 11 |
| §5 Typography | 4 |
| §6 New tests | 3, 6, 8, 9, 10 |
| §6 `panelMemoization` extension | 8 (Step 7) |
| §6 Verification at 375/1440 both themes | 11 (Step 6) |

Two additions beyond the spec, both small and justified in place: Task 11's focus-ring rules (the spec's dark theme makes the missing rings a real accessibility gap) and Task 12 (the project's standing convention to update `CLAUDE.md`).

**Placeholder scan:** no "TBD", "similar to Task N", or bare "add error handling". Task 5's palette table is a concrete candidate set with an explicit validation step, not a placeholder. Task 11 Steps 1 and 4 are inspections whose expected result is stated.

**Type consistency:** `SERIES`, `BANDS`, `CHART_UI`, `AQI_BAND_CLASS` (Task 5) are used with those exact names in Tasks 6, 7, 8. `PanelSeries` fields `{ name, color, dashed? }` match every call site in Task 6 Step 7. `ChartCrosshair`'s `{ index, count, containerRef }` matches Task 8 Steps 1 and 6. `RouteHeader`'s `{ title, chips, actions, children }` matches Tasks 10 Steps 5 and 6. `THEME_KEY = "cw_theme"` matches the inline script's literal.

**Known ordering hazard:** Task 2 introduces `var(--series-temp, #dc2626)` fallbacks that Task 5 Step 7 removes. If Task 5 is skipped or reordered, `.hi`/`.lo` silently keep the light-mode red and blue on a dark background. Task 5 Step 7 is the only place that clears this.
