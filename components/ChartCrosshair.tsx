"use client";
import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";

/**
 * One vertical line across the whole forecast stack.
 *
 * It is deliberately NOT a Recharts <ReferenceLine> inside each panel.
 * ForecastChart documents a measured fix: setActivePoint fires on every
 * mousemove, and the six panels are React.memo'd with stable props because
 * without that, each move re-rendered ~2,000 SVG nodes (frame p50 94ms, 58 long
 * tasks; 17ms and zero after). A per-hover `x` prop would undo exactly that.
 * ForecastChart already re-renders on hover for the readout, so an overlay it
 * owns costs one <div>. tests/components/forecastChartProps.test.tsx is the
 * guard: it fires a hover and asserts every panel prop keeps its identity.
 *
 * Geometry is measured off a rendered axis rather than recomputed from
 * Recharts' internals. One measurement serves all six panels because
 * tests/components/panelAlignment.test.tsx guarantees their x-axis extents are
 * identical — that test is load-bearing for this component, not just
 * protective.
 *
 * The position is the centre of the hovered hour's band:
 * `x1 + (index + 0.5) * (x2 - x1) / count`. Measured, the six panels do not all
 * use the same Recharts scale: PrecipPanel and WindPanel contain a <Bar>, so
 * their category axis is a band scale whose hour `i` sits exactly at that
 * centre; the four bar-less panels get a point scale, which puts hour `i` at
 * `x1 + i * (x2 - x1) / (count - 1)`. The two differ by at most half a band —
 * (x2 - x1) / (2 * count) — at the first and last hour and coincide mid-window.
 * At the real page width that bound is about 2.4px: .route-page caps the page at
 * 64rem, which leaves .chart-inner ~940px and a plot extent of ~795px once
 * Recharts insets 68px (LEFT_MARGIN + the y-axis) and 80px, and the widest band
 * comes from the 7-day window's 168 hours. So one band-centre line lands within
 * ~2.4px of every panel's own rendering at the extreme hours and is exact
 * mid-window. (At the 24 points the unit test uses the same bound is 13.6px,
 * which is why the test asserts the formula and not any panel's geometry.)
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

  const measure = useCallback((): boolean => {
    const host = containerRef.current;
    if (!host) return false;
    const line = host.querySelector(AXIS_SELECTOR);
    if (!line) return false;
    const x1 = parseFloat(line.getAttribute("x1") ?? "");
    const x2 = parseFloat(line.getAttribute("x2") ?? "");
    if (Number.isNaN(x1) || Number.isNaN(x2) || x2 <= x1) return false;
    setExtent(prev => (prev && prev.x1 === x1 && prev.x2 === x2 ? prev : { x1, x2 }));
    return true;
  }, [containerRef]);

  // Re-measure when a hover starts, not on every move. On a resize both this
  // component's ResizeObserver and Recharts' own fire in the same delivery, and
  // there is no ordering guarantee: measuring then can read the axis before
  // Recharts has committed its re-render at the new width, leaving `extent` one
  // step stale until the next resize — visible after a discrete jump like
  // maximising the window, rotating a phone or opening devtools. Extents only
  // move on resize, so re-reading once at the null -> non-null transition is
  // enough to correct it, and the dependency is the boolean, not the index, so
  // this does not run while the cursor sweeps.
  const hovering = index !== null;
  useLayoutEffect(() => {
    if (hovering) measure();
  }, [hovering, measure]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    // Recharts' own ResponsiveContainer only emits an SVG once its ResizeObserver
    // has reported a width, which can land after this effect runs — and the
    // panels have fixed heights, so .chart-inner's box never changes when the
    // charts appear and the ResizeObserver below would not fire again. Watch for
    // the axis arriving, exactly once, then stop: a subtree observer left running
    // over six charts is the mutation firehose the ResizeObserver exists to avoid.
    let mo: MutationObserver | null = null;
    if (!measure()) {
      mo = new MutationObserver(() => {
        if (measure()) {
          mo?.disconnect();
          mo = null;
        }
      });
      mo.observe(host, { childList: true, subtree: true });
    }

    const ro = new ResizeObserver(() => measure());
    ro.observe(host);
    return () => {
      ro.disconnect();
      mo?.disconnect();
    };
    // `count` is a dependency because changing the day window re-renders the
    // charts at a new width; re-measuring on that is cheaper than watching
    // every SVG mutation.
  }, [containerRef, count, measure]);

  if (index === null || count <= 0 || !extent) return null;

  const band = (extent.x2 - extent.x1) / count;
  const left = extent.x1 + (index + 0.5) * band;

  return (
    <div
      aria-hidden="true"
      className="chart-crosshair"
      data-testid="chart-crosshair"
      style={{ left: `${left}px` }}
    />
  );
}
