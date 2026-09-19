import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { Bar, ComposedChart, Line, ReferenceArea, ResponsiveContainer, XAxis, YAxis } from "recharts";

// The redesign themes charts with a CSS class + stylesheet rule
// (`.series-temp { stroke: var(--series-temp); }`) rather than `var()` inside an
// SVG presentation attribute. That only works if Recharts actually forwards the
// `className` prop we pass on <Line>/<Bar>/<ReferenceArea> onto the SVG element it
// paints. This file pins that behavior for the three component types this
// codebase colors, so every later theming task can rely on it without
// re-verifying it from scratch.
//
// Recharts' ResponsiveContainer measures 0x0 in jsdom and renders no chart body.
// Give it an explicit size so the series/bands reach the DOM. Mock copied
// verbatim from tests/components/panelAlignment.test.tsx.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <actual.ResponsiveContainer width={800} height={300}>{children}</actual.ResponsiveContainer>
    ),
  };
});

const data = Array.from({ length: 12 }, (_, i) => ({
  x: `2026-01-01T${String(i).padStart(2, "0")}:00`,
  v: i,
}));

function renderChart(children: React.ReactNode) {
  return render(
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data}>
        <XAxis dataKey="x" />
        <YAxis />
        {children}
      </ComposedChart>
    </ResponsiveContainer>,
  );
}

describe("Recharts className forwarding", () => {
  it("puts a Line's className on the rendered curve", () => {
    const { container } = renderChart(
      <Line dataKey="v" className="probe-line" dot={false} />,
    );
    const el = container.querySelector(".probe-line");
    expect(el).not.toBeNull();
    // The class lands on the <g class="recharts-layer recharts-line probe-line">
    // wrapper, not the <path> itself — but that wrapper's only child is the
    // <path class="recharts-curve recharts-line-curve"> that actually strokes the
    // series, so ".probe-line path" reaches the painted element a CSS rule like
    // `.probe-line { stroke: var(--x) }` would need to target (stroke is
    // inherited down to the path in this DOM shape).
    expect(container.querySelector("path.probe-line, .probe-line path")).not.toBeNull();
  });

  it("puts a Bar's className on the rendered bars", () => {
    // Bar's shapes only mount once its enter animation has run. react-smooth's
    // animation driver never ticks in jsdom (no real rAF/browser timing), so
    // with the default isAnimationActive the bar group renders empty
    // (<g class="recharts-inactive-bar"></g>, no <path> inside) even though the
    // outer <g class="recharts-layer recharts-bar probe-bar"> is present — that
    // was the first failure observed here. isAnimationActive={false} renders the
    // final frame synchronously; this is a test-only accommodation for jsdom's
    // lack of real animation timing, not a production requirement.
    const { container } = renderChart(
      <Bar dataKey="v" className="probe-bar" isAnimationActive={false} />,
    );
    const el = container.querySelector(".probe-bar");
    expect(el).not.toBeNull();
    // Unlike Line, Bar forwards the className to *both* the outer <g> wrapper
    // AND each individual bar shape — which Recharts renders as
    // <path class="recharts-rectangle probe-bar">, not <rect>.
    expect(container.querySelector("path.probe-bar, .probe-bar path")).not.toBeNull();
  });

  it("puts a ReferenceArea's className on the rendered area", () => {
    // A ReferenceArea renders as <path class="recharts-reference-area-rect">,
    // not <rect> — see the note in tests/components/DewPointPanel.test.tsx
    // (lines 28-34). It also does not render at all — not even the wrapper —
    // unless the chart has at least one graphical series (Line/Bar/Area)
    // alongside it; a ComposedChart containing only axes and a ReferenceArea
    // produced no `.recharts-reference-area` node whatsoever, which was the
    // second failure observed here. Every real usage in this codebase (e.g.
    // DewPointPanel's friction/weekend/night bands) already sits beside a
    // <Line>, so this sibling matches production shape rather than working
    // around a limitation.
    const { container } = renderChart(
      <>
        <ReferenceArea x1={data[2].x} x2={data[5].x} fill="#f59e0b" stroke="none" className="probe-area" />
        <Line dataKey="v" dot={false} isAnimationActive={false} />
      </>,
    );
    const el = container.querySelector(".probe-area");
    expect(el).not.toBeNull();
    expect(container.querySelector("path.probe-area, .probe-area path")).not.toBeNull();
    // The class lands on the <g class="recharts-layer recharts-reference-area
    // probe-area"> wrapper; its one child carries Recharts' own fixed class.
    expect(container.querySelector(".probe-area path.recharts-reference-area-rect")).not.toBeNull();
  });
});
