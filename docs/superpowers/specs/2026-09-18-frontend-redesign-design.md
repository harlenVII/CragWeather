# Frontend redesign — dark-first data instrument

Date: 2026-09-18

## Goal

The app's information design is good and its visual design is not. Every surface is
styled by one 317-line `app/globals.css` with six ad-hoc CSS variables, the system
font stack, a flat `#fafafa` page and generic white-card-with-1px-border components.
There is no dark mode, no type scale, no spacing scale, and chart colors are hardcoded
hex literals repeated across seven files.

Redesign the frontend as a **dark-first data instrument**: dark by default with a light
theme, a real token layer, one variable typeface with tabular numerals, and a denser,
cross-readable forecast stack.

## Decisions taken during design

| Question | Decision |
|---|---|
| Aesthetic direction | Dark-first data instrument |
| Theme policy | Dark default, light via a persisted toggle |
| Styling layer | Expanded plain-CSS token layer; no framework |
| Chart library | **Stay on Recharts** |
| Panel stack | Keep all six stacked and cross-readable; make denser; add a shared crosshair |
| Typography | One variable sans (Inter) self-hosted, tabular numerals |
| "Now conditions" strip | **Rejected** — not in scope |
| "Best days" verdict | **Rejected** — a new claim with no validated scoring rule |
| Day cards above charts | **Rejected** — order unchanged |
| Collapsible history | **Rejected** — stays expanded |
| Structural changes in scope | Persistent app header; rebuilt route header block |

### Why Recharts stays

The modern-chart look is palette, typography, grid treatment and interaction polish,
not library capability. Switching costs the cross-panel hover sync that already works,
plus the Recharts-specific knowledge recorded in `CLAUDE.md` (category-axis
`ReferenceArea` boundary snapping, the `margin.right` totals-80 rule, band-before-grid
SVG ordering, domain anchoring so bands are not discarded), plus the ~19 component
tests that target Recharts' DOM.

uPlot is the only alternative that would be a genuine upgrade — it has built-in
cross-chart cursor sync and is faster on dense series — but the sync is already built
here and 360 points × 6 panels is trivial for SVG. Revisit only if a specific panel
needs something Recharts cannot express; port that one panel then.

## Sequencing (approach A: foundation-first)

Chosen over surface-by-surface (tokens drift when invented per screen) and over a
theme feature flag (ceremony, given instant Vercel rollback).

1. **Token extraction as a provable no-op.** Retokenize every existing rule with light
   values identical to today's colors. The app must look pixel-identical; dark tokens
   exist but are unused. This is the checkpoint gate.
2. Dark palette + theme toggle.
3. Chart palette via `lib/chartColors.ts`.
4. Typography.
5. Panel density + crosshair.
6. App header + route header block.
7. Remaining surfaces.

The numbered sections below are organised by topic, not by build order. Where the two
differ, **this sequencing is authoritative** — typography (§5) lands before panel
density (§3), because the type scale affects axis-label widths.

---

## 1. Token layer and theming

**Files:** `app/styles/tokens.css`, `app/styles/base.css`, `app/styles/components.css`.
`app/globals.css` becomes three `@import`s.

Dark is the `:root` default; light is a `[data-theme="light"]` override.

```css
:root {                      /* dark — the default */
  --bg-0: #0b0f14;           /* page */
  --bg-1: #141a21;           /* card / panel */
  --bg-2: #1c242e;           /* raised: hover, input */
  --fg-0: #e8edf2;           /* primary text */
  --fg-1: #9aa7b4;           /* secondary */
  --fg-2: #64717f;           /* tertiary / axis */
  --border: #222c37;
  --accent: #fb7a3c;
}
:root[data-theme="light"] {  /* exactly today's values */
  --bg-0: #fafafa; --bg-1: #ffffff; --bg-2: #f3f4f6;
  --fg-0: #1a1a1a; --fg-1: #6b7280; --fg-2: #9ca3af;
  --border: #e5e7eb; --accent: #c2410c;
}
```

The dark accent is lifted from `#c2410c` because that fails contrast against `#0b0f14`.
Exact values are validated during implementation (see §2 on the `dataviz` skill); the
roles above are the contract.

Non-color scales are single-valued, shared by both themes: `--space-1..8` on a 4px base,
`--radius-sm/md/lg`, `--text-xs..2xl`, `--shadow-1/2`, `--ring`.

**Theme selection has three parts:**

- A **blocking inline `<script>` in `<head>`** reading `localStorage.cw_theme` and setting
  `data-theme` before first paint. Without it every load flashes white, which is
  unacceptable when dark is the default. It must be inline and synchronous — a deferred
  or component-level effect runs after paint.
- `components/ThemeToggle.tsx`, a client component writing `cw_theme`, mirroring how
  `cragweather_days` persists in `WeatherView`.
- `<meta name="theme-color">` becomes two `media`-scoped tags, replacing the single
  hardcoded `#c2410c` in `app/layout.tsx`.

**Default when nothing is stored:** dark, regardless of `prefers-color-scheme`. The dark
instrument look is the design; an OS light preference must not hide it. The toggle is
how a user opts out.

**Known bug fixed here:** `.sync-modal__panel` is styled with `var(--background, white)`
and `var(--foreground, #111)`. Neither variable is defined anywhere in the codebase, so
the modal has always rendered via the fallbacks. Under a dark theme it would be a white
rectangle. It moves onto `--bg-1` / `--fg-0`.

## 2. Chart palette

### Wiring

Colors become **CSS custom properties referenced directly in SVG presentation
attributes**:

```tsx
<Line dataKey="temp" stroke="var(--series-temp)" />
```

The panels never learn the theme exists: no new props, `React.memo` untouched, theme
switching instant with zero React work.

**This must be verified in a real browser before anything else in the redesign is
built** — Safari and Firefox included. `var()` in SVG presentation attributes is
well-supported but it is the load-bearing assumption of this section.

**Fallback if it fails:** a `useTheme()` hook returning a frozen palette object, passed
to the panels as one `colors` prop. Object identity is stable across renders, so
memoization still holds; it is only more plumbing.

### Single source of truth

`lib/chartColors.ts` exports the variable *names* as named constants:

```ts
export const SERIES = {
  temp: "var(--series-temp)",
  feelsLike: "var(--series-feels)",
  precip: "var(--series-precip)",
  precipChance: "var(--series-chance)",
  wind: "var(--series-wind)",
  gust: "var(--series-gust)",
  dewPoint: "var(--series-dew)",
  humidity: "var(--series-humidity)",
} as const;

export const BANDS = {
  night: "var(--band-night)",
  weekend: "var(--band-weekend)",
  dewGood: "var(--band-dew-good)",
  dewGreasy: "var(--band-dew-greasy)",
  aqiDead: "var(--band-aqi-dead)",
} as const;
```

This removes the duplication where each series color is written once in its panel and
again as an inline `style={{ color: "#dc2626" }}` in the `ForecastChart` hover strip.

### Three color rules

- **Series colors** get a dark and a light value per role. Dark needs more chroma and
  lightness than today's set; `#dc2626` on `#141a21` is muddy.
- **AQI band hues stay EPA-exact** (`#00e400`, `#ffff00`, `#ff7e00`, `#ff0000`,
  `#8f3f97`, `#7e0023` in `lib/aqiBands.ts`). They are a recognized public-health
  convention, not a palette choice. Only fill opacity differs between themes.
- **Grid** `stroke="#eee"` is hardcoded in all six panels and is invisible on dark.
  It becomes `var(--grid)`.

### Exact values are deferred

Load the `dataviz` skill before choosing hex values — it carries a contrast-validation
method. Eyeballing eight series colors against two backgrounds is how a wind line ends
up invisible. This spec fixes the roles and constraints, not the values.

### Test impact

Assertions on hex literals become assertions on the imported constants:

```ts
// tests/components/ForecastChart.test.tsx
expect(container.querySelectorAll(`[fill="${BANDS.night}"]`)).toHaveLength(10);
```

Affected: `ForecastChart.test.tsx` (`#475569`), `AirQualityPanel.test.tsx` (EPA hexes),
`DewPointPanel.test.tsx` (band fills, `#d1d5db`), `WeatherView.test.tsx` (`#475569`).
After this the tests assert that the correct *role* is used and never break again on a
color change.

## 3. Denser panel stack

### Legends become inline HTML labels

Six Recharts `<Legend/>`s each consume ~25px inside the chart height and centre a swatch
row under every panel. They are replaced by one small HTML label row per panel, above
the chart: the panel name left-aligned in `--fg-2` small caps, the series keys
right-aligned in their own colors.

**The series label strings must stay byte-identical** — `"Temp (°C)"`,
`"Feels like (°C)"`, `"Precip (mm)"`, `"Chance (%)"`, `"Dew point (°C)"`. Five existing
assertions read them via `getByText`, and those assertions are testing "is this series
plotted", which remains true. In particular `TempPanel.test.tsx` asserts
`"Dew point (°C)"` is **absent** and `DewPointPanel.test.tsx` asserts `"Temp (°C)"` is
**absent** — the deliberate separation documented in `CLAUDE.md`. Both must still hold.

### Heights

With legends out of the box: temp `260 → 220`, the other five `150 → 130`. Total stack
~1010px → ~870px, while each plot area is slightly taller than today.

### Crosshair overlay

A single absolutely-positioned 1px element inside `.chart-inner`, spanning the full
stack height, owned by `ForecastChart`.

**It must not be a Recharts `ReferenceLine` inside the panels.** `ForecastChart` documents
a measured fix: `setActivePoint` fires on every mousemove, and the six panels are
`React.memo`'d with stable props because without it every move re-rendered ~2,000 SVG
nodes — frame p50 94ms with 58 long tasks, down to 17ms and zero. A changing `hoveredX`
prop would undo precisely that. `ForecastChart` already re-renders on hover for the
readout strip, so an overlay it owns is free.

Geometry is measured from the rendered axis rather than recomputed from Recharts'
internals:

```
x = axisX1 + (hoverIndex + 0.5) * (axisX2 - axisX1) / data.length
```

`axisX1`/`axisX2` are read once from
`.recharts-xAxis line.recharts-cartesian-axis-line` via a ref and refreshed on a
`ResizeObserver`. This is the same selector `tests/components/panelAlignment.test.tsx`
uses, and that test is what guarantees one measurement is valid for all six panels —
it becomes load-bearing rather than merely protective. Add a comment there saying so.

The overlay lives inside `.chart-inner` so it scrolls with the charts in the horizontal
scroll container.

### Sticky readout

The hover strip currently scrolls away, so on a 15-day window the numbers are off-screen
while hovering a lower panel. It becomes `position: sticky` below the app header,
restyled as a labeled row with tabular numerals in fixed-width slots so digits do not
reflow during a sweep.

### Touch

Unchanged. `onTouchMove` / `onTouchStart` already feed the same `onHover`, so the
crosshair follows a finger without new code.

### Explicitly not changed

Band z-ordering (night, then weekend, then series — SVG has no z-index), `LEFT_MARGIN`,
the `margin.right` totals-80 rule, `MM_AXIS_FLOOR`, `AQI_AXIS_FLOOR`, the
`dewPointDomain` anchors, `connectNulls={false}`, the AQI dead-zone shading, and the
`snapToHour` night-band behaviour. Each is a documented decision with a recorded reason
that this redesign does not revisit.

## 4. Page shells

### `components/AppHeader.tsx`

Slim and sticky, rendered on every page from `app/layout.tsx`:

```
● CragWeather        ⌕ route, URL or coords…        ☀/☾
```

- Wordmark links home.
- Compact `SearchBox` on every page **except** `/`, where the hero search is already the
  focus; selected by `usePathname`. On narrow viewports it collapses to a ⌕ that expands.
- `SearchBox` gains `variant?: "hero" | "compact"`, **styling only**. The
  `parseSearchTarget` routing logic is untouched.
- Replaces the "← Search another route" footer link on the route and GPS pages.

### `components/RouteHeader.tsx`

One composed block replacing the loose `<p>` stack in `app/route/[id]/page.tsx`:

```
The Nose
[ Yosemite Valley ]  [ 5.9 C2 ]
♡ Save        Mountain Project ↗    Windy ↗
updated 2 minutes ago
```

Area and grade become chips; the MP and Windy links become buttons sharing a row with
Save. `app/at/[coords]/page.tsx` uses the same block. `GpsHeader` keeps its `override`
save-state mechanism — it exists so the title reflects a save without a reload, and
removing it would regress that.

### Retokenize only, no structural change

Home hero, `SavedRoutes` cards, `DailyCards`, `SyncModal` (plus the undefined-variable
bug in §1), `ConfirmJoin`, the about page, and the `loading.tsx` / `error.tsx` /
`not-found.tsx` files.

## 5. Typography

Self-host Inter Variable through `next/font/local` — no network request, no layout
shift, no Google dependency. One family; headings get weight and tighter tracking rather
than a second typeface.

The woff2 is committed to `public/fonts/` (Inter is SIL Open Font License, so
redistribution is fine; include the license file). Subset to latin + latin-ext; the full
variable file is ~340kb, the latin subset ~110kb. `next/font/local` handles the
`font-display` and preload headers.

`font-variant-numeric: tabular-nums` applies to every figure: axis ticks, day-card
temperatures, the hover readout, the hourly list. Proportional digits make columns
jitter, which is the single most dated thing about the current numbers.

## 6. Testing and verification

**Must stay green with no edits** — these are the regression net:
`panelAlignment`, `panelMemoization`, `DailyCards`, `SearchBox`, `SyncModal`,
`SavedRoutes`, `WeatherView`.

**Mechanically updated:** the hex-literal assertions listed in §2.

**New tests:**

- `ThemeToggle` — persists to `cw_theme`, sets `data-theme`, defaults to dark when
  storage is empty.
- `AppHeader` — search absent on `/`, present elsewhere.
- Crosshair overlay — renders on hover, positions from the hover index, absent on leave.

`panelMemoization.test.tsx` is the critical guard for the crosshair not being pushed into
the panels as a prop. Read it before implementing §3 and extend it if it does not already
assert a hover-driven re-render count.

**Verification:** `npm test` and `npm run lint` green, plus a browser pass at 375px and
1440px in both themes. The `var()`-in-SVG check from §2 happens **first**, because a
negative result changes §2's wiring.

## Out of scope

- A "now conditions" strip.
- A "best days" / conditions verdict. It would need a defined and validated scoring
  rule; a wrong call is worse than no call. Separate spec if wanted.
- Tabbed or collapsible forecast panels — both break the cross-read that is the stack's
  reason for existing.
- Reordering day cards above the charts; collapsing the history section.
- Any change to weather fetching, aggregation, slicing, scraping, or the database.
