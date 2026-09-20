import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
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
    for (const key of ["data", "ticks", "tickFormatter", "weekendBands", "nightBands", "onHover", "onLeave"]) {
      expect(Object.is(first[key], latest[key])).toBe(true);
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
