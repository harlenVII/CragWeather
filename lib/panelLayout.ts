/**
 * Left margin shared by every panel in the forecast stack.
 *
 * A rotated `insideLeft` axis label needs room: at `left: 0` the "°C" / "mm" /
 * "%" / "m/s" labels overhang the SVG's left boundary by ~4px and are clipped by
 * the scroll container, at every viewport width.
 *
 * It must stay identical across all five panels. Recharts insets the plot area by
 * `margin.left` plus the left axis width, so a panel with a different left margin
 * drifts out of horizontal register with the rest of the stack — the same failure
 * `margin.right` causes, guarded by tests/components/panelAlignment.test.tsx.
 */
export const LEFT_MARGIN = 8;
