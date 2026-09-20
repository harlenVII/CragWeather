import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, within } from "@testing-library/react";
import type { HourlyWeather } from "@/lib/weather";

// The other half of the guard in tests/components/panelMemoization.test.tsx.
// That file asserts each panel is React.memo'd; React.memo with unstable props
// is a no-op, so this file asserts the props ForecastChart passes survive a
// hover with their identities intact.
//
// This lives in its OWN file on purpose: the mock below replaces TempPanel with
// a plain function, which would make panelMemoization's
// `$$typeof === Symbol.for("react.memo")` assertion fail if the two shared a
// module registry.
//
// Mocking only TempPanel is enough: it receives the same prop shape as the rest,
// and it is the panel a reader hovers first.
const captured: Record<string, unknown>[] = [];

vi.mock("@/components/TempPanel", () => ({
  TempPanel: (props: Record<string, unknown>) => {
    captured.push(props);
    return (
      <div
        data-testid="temp-panel"
        onMouseMove={() => (props.onHover as (i: number) => void)?.(3)}
      />
    );
  },
}));

import { ForecastChart } from "@/components/ForecastChart";

const hours: HourlyWeather[] = Array.from({ length: 24 }, (_, i) => ({
  datetime: `2026-01-01T${String(i).padStart(2, "0")}:00`,
  temp: 10, feelsLike: 9, dewPoint: 4, humidity: 55,
  precip: 0, precipChance: 10, windSpeed: 3, windGust: 5,
}));

describe("ForecastChart panel props across a hover", () => {
  it("keeps every panel prop referentially identical when the hover index changes", () => {
    // The crosshair must stay a DOM overlay owned by ForecastChart. If someone
    // "simplifies" it into a per-panel <ReferenceLine>, a hover-varying prop
    // lands here and the memoisation — worth 94ms -> 17ms frame p50 and 58 long
    // tasks -> zero — silently dies with no other test noticing.
    captured.length = 0;
    const { getByTestId } = render(<ForecastChart hourly={hours} />);
    const before = captured.length;

    fireEvent.mouseMove(getByTestId("temp-panel"));

    // The hover must actually have re-rendered ForecastChart, or this test proves
    // nothing. If this fails, the readout stopped updating on hover.
    expect(captured.length).toBeGreaterThan(before);

    const first = captured[0];
    const latest = captured[captured.length - 1];

    // Every key, not a named list. A named list only catches a regression in the
    // props that exist today — a new hover-varying prop called `crosshairIndex`
    // would sail through it, which is exactly the regression this file exists to
    // catch. Comparing the key sets as well means an added prop fails here even
    // before anyone thinks to name it.
    expect(Object.keys(latest).sort()).toEqual(Object.keys(first).sort());
    for (const key of Object.keys(latest)) {
      expect(Object.is(first[key], latest[key]), `prop "${key}" changed identity across a hover`).toBe(true);
    }
    // The props under test have to actually be there, or an empty object passes.
    for (const key of ["data", "ticks", "tickFormatter", "weekendBands", "nightBands", "onHover", "onLeave"]) {
      expect(Object.keys(latest)).toContain(key);
    }
  });

  it("passes no prop carrying the hover position into a panel", () => {
    captured.length = 0;
    const { getByTestId } = render(<ForecastChart hourly={hours} />);
    fireEvent.mouseMove(getByTestId("temp-panel"));
    const latest = captured[captured.length - 1];
    for (const forbidden of ["activeIndex", "hoverIndex", "crosshairX", "hoveredX", "activePoint"]) {
      expect(Object.keys(latest)).not.toContain(forbidden);
    }
  });

  it("updates the readout on that hover, so the crosshair has a parent re-render to ride on", () => {
    captured.length = 0;
    const { getByTestId } = render(<ForecastChart hourly={hours} />);
    fireEvent.mouseMove(getByTestId("temp-panel"));
    expect(getByTestId("chart-readout").textContent).toContain("2026-01-01 03:00");
  });
});

// The hover strip sits directly above the chart stack, in flow, so anything that
// changes its wrapped row count moves all six panels down or up under the
// pointer. Height itself is unmeasurable in jsdom (Recharts already renders 0x0
// there), so these pin the two structural invariants the fixed-width cells turn
// into a stable height: the same cells exist whether or not an hour is hovered,
// and no hovered hour drops one.
describe("ForecastChart readout cell count", () => {
  const cells = (el: HTMLElement) => el.querySelectorAll(".chart-readout__cell").length;
  // Covers only the first two hours, so the hovered hour (index 3) is past the
  // CAMS cutoff and carries a null AQI — the real shape on most of the window.
  const partialAir = { hourly: hours.slice(0, 2).map(h => ({ datetime: h.datetime, usAqi: 42 })) };
  const fullAir = { hourly: hours.map(h => ({ datetime: h.datetime, usAqi: 42 })) };

  it("is unchanged when the pointer enters the stack", () => {
    const { getByTestId } = render(<ForecastChart hourly={hours} air={fullAir} />);
    const idle = cells(getByTestId("chart-readout"));
    expect(idle).toBeGreaterThan(0);

    fireEvent.mouseMove(getByTestId("temp-panel"));

    expect(getByTestId("chart-readout").textContent).toContain("2026-01-01 03:00");
    expect(cells(getByTestId("chart-readout"))).toBe(idle);
  });

  it("is unchanged on an hour with no probability and no AQI value", () => {
    const sparse = hours.map((h, i) => (i === 3 ? { ...h, precipChance: null } : h));

    // Both charts are on screen at once, so the queries are scoped to their own
    // containers rather than to document.body.
    const a = within(render(<ForecastChart hourly={hours} air={fullAir} />).container);
    fireEvent.mouseMove(a.getByTestId("temp-panel"));
    const b = within(render(<ForecastChart hourly={sparse} air={partialAir} />).container);
    fireEvent.mouseMove(b.getByTestId("temp-panel"));

    // The dashes are what hold the slots open; "0%" would be a claim.
    expect(b.getByTestId("chart-readout").textContent).toContain("\u2014");
    expect(cells(b.getByTestId("chart-readout"))).toBe(cells(a.getByTestId("chart-readout")));
  });
});
