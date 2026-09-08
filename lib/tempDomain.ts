import { GOOD_MAX_C, GREASY_MIN_C } from "@/lib/dewPointBands";

/** Padding above and below the data, in °C, so lines never touch the panel edge. */
export const PAD_C = 2;

/** Smallest range the °C axis will ever show, in degrees. */
export const MIN_SPAN_C = 10;

/** Domain used when a series is empty or carries no finite values. */
const FALLBACK: readonly [number, number] = [0, MIN_SPAN_C];

/**
 * Y-axis domain for the two °C panels.
 *
 * Recharts anchors a numeric axis at 0 by default, and its `'auto'` lower bound
 * does the same for all-positive data — so a 7–29°C day rendered against 0–28
 * and wasted the bottom third of the panel on temperatures that never occur.
 * Temperature is an interval scale: zero carries no special meaning, unlike
 * precipitation, wind and humidity, where zero means "none" and their panels
 * keep it.
 *
 * Auto-fitting alone would swap that problem for the opposite one — a flat
 * 12–14°C day stretched to fill the panel reads as a dramatic swing — so the
 * range is widened to `MIN_SPAN_C` when the data is flatter than that, keeping
 * the data centred. Same reasoning as `MM_AXIS_FLOOR` in `PrecipPanel`.
 *
 * Recharts' own per-bound domain functions cannot express this: each receives
 * only its own bound, so neither can see the span.
 */
export function tempDomain(values: number[]): [number, number] {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return [...FALLBACK];

  let min = Math.min(...finite) - PAD_C;
  let max = Math.max(...finite) + PAD_C;

  const shortfall = MIN_SPAN_C - (max - min);
  if (shortfall > 0) {
    min -= shortfall / 2;
    max += shortfall / 2;
  }

  return [Math.floor(min), Math.ceil(max)];
}

/**
 * Y-axis domain for the dew-point panel.
 *
 * Same padding and minimum-span rules as `tempDomain`, but with the two friction
 * thresholds folded in as extra anchors, so the axis always spans at least
 * `GOOD_MAX_C - PAD_C` to `GREASY_MIN_C + PAD_C`.
 *
 * Without them the axis auto-fits the dew point alone, and a Recharts
 * `ReferenceArea` lying outside the domain is simply not drawn: a cool crag
 * sitting at 6–9°C would render the good-friction band and silently drop the
 * greasy one, so the reader could not tell a comfortable margin from a narrow
 * one. Anchoring also holds the bands in the same place from crag to crag and
 * across the 7/10/15-day windows, which is the whole value of a threshold cue —
 * the same reasoning as `MM_AXIS_FLOOR` in `PrecipPanel`.
 *
 * The anchors are floors, never ceilings: they only ever widen the range, so
 * sub-zero dew points still extend the axis downward instead of being clipped.
 */
export function dewPointDomain(values: number[]): [number, number] {
  return tempDomain([...values, GOOD_MAX_C, GREASY_MIN_C]);
}
