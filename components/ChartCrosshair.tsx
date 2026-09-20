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
 * With the 700px-minimum chart and the 168–360 hours a 7/10/15-day window
 * actually carries that bound is under 2px, so one band-centre line is within a
 * couple of pixels of every panel's own rendering. (At the 24 points the unit
 * test uses it would be 13.6px, which is why the test asserts the formula and
 * not any panel's rendered geometry.)
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

    function measure(): boolean {
      const line = host!.querySelector(AXIS_SELECTOR);
      if (!line) return false;
      const x1 = parseFloat(line.getAttribute("x1") ?? "");
      const x2 = parseFloat(line.getAttribute("x2") ?? "");
      if (Number.isNaN(x1) || Number.isNaN(x2) || x2 <= x1) return false;
      setExtent(prev => (prev && prev.x1 === x1 && prev.x2 === x2 ? prev : { x1, x2 }));
      return true;
    }

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
  }, [containerRef, count]);

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
