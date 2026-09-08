import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { TempPanel } from "@/components/TempPanel";
import { PrecipPanel } from "@/components/PrecipPanel";
import { HumidityPanel } from "@/components/HumidityPanel";
import { DewPointPanel } from "@/components/DewPointPanel";
import { WindPanel } from "@/components/WindPanel";

// Recharts' ResponsiveContainer measures 0x0 in jsdom and renders no chart body.
// Give it an explicit size so the axes reach the DOM. This forces every panel to
// the same fixed height regardless of its own `height` prop, so this test can only
// speak to horizontal extents (see below) — never to vertical/height alignment.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <actual.ResponsiveContainer width={800} height={300}>{children}</actual.ResponsiveContainer>
    ),
  };
});

const hours = Array.from({ length: 24 }, (_, i) => `2026-01-01T${String(i).padStart(2, "0")}:00`);

// The rendered x-axis is a <g class="recharts-xAxis ..."> containing both the single
// axis line (class recharts-cartesian-axis-line) and one tick line per data point
// (class recharts-cartesian-axis-tick-line) — ".recharts-xAxis line" alone matches
// all of them, so the axis-line class narrows it to the one line whose x1/x2 mark
// the actual plotted extent.
function xAxisExtent(container: HTMLElement): { x1: string | null; x2: string | null } {
  const line = container.querySelector(".recharts-xAxis line.recharts-cartesian-axis-line");
  expect(line).not.toBeNull();
  return { x1: line!.getAttribute("x1"), x2: line!.getAttribute("x2") };
}

describe("forecast panel x-axis alignment", () => {
  it("gives all five stacked panels the same horizontal x-axis extent", () => {
    // Same mocked container width (800px) and the same 24-point hourly series for
    // every panel — the only thing left that can move a panel's x-axis is its own
    // margin/right-axis configuration. ForecastChart stacks these panels on one
    // conceptual x-axis; if any one panel insets its plot area differently, its
    // bars/lines drift out of vertical register with the others (this is exactly
    // what PrecipPanel's stray right-axis width did before Fix 1).
    const tempData = hours.map(x => ({ x, temp: 10, feelsLike: 8, dewPoint: 3 }));
    const precipData = hours.map(x => ({ x, precip: 1, chance: 20 as number | null }));
    const humidityData = hours.map(x => ({ x, humidity: 50 }));
    const dewPointData = hours.map(x => ({ x, dewPoint: 3 }));
    const windData = hours.map(x => ({ x, speed: 5, gust: 8 }));

    const temp = render(<TempPanel data={tempData} />);
    const precip = render(<PrecipPanel data={precipData} />);
    const humidity = render(<HumidityPanel data={humidityData} />);
    const dewPoint = render(<DewPointPanel data={dewPointData} />);
    const wind = render(<WindPanel data={windData} />);

    const tempExtent = xAxisExtent(temp.container);
    const precipExtent = xAxisExtent(precip.container);
    const humidityExtent = xAxisExtent(humidity.container);
    const dewPointExtent = xAxisExtent(dewPoint.container);
    const windExtent = xAxisExtent(wind.container);

    // Compared against each other, never against hardcoded pixel numbers, so this
    // keeps passing through any future margin change as long as all five panels
    // move together.
    expect(precipExtent).toEqual(tempExtent);
    expect(humidityExtent).toEqual(tempExtent);
    expect(dewPointExtent).toEqual(tempExtent);
    expect(windExtent).toEqual(tempExtent);
  });
});
