import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { TempPanel } from "@/components/TempPanel";
import { BANDS } from "@/lib/chartColors";

// Recharts' ResponsiveContainer measures 0x0 in jsdom and renders no chart body.
// Give it an explicit size so the legend, lines and axes reach the DOM.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <actual.ResponsiveContainer width={800} height={300}>{children}</actual.ResponsiveContainer>
    ),
  };
});

const data = Array.from({ length: 24 }, (_, i) => ({
  x: `2026-01-01T${String(i).padStart(2, "0")}:00`,
  temp: 10 + i,
  feelsLike: 8 + i,
}));

describe("TempPanel", () => {
  // The old getByText("Temp (°C)")/getByText("Feels like (°C)") checks moved to
  // ForecastChart.test.tsx, where PanelLabel (which now owns that text) actually
  // renders — this panel no longer has a legend to read. The old
  // queryByText("Dew point (°C)") absence check — dew point lives on its own
  // panel below humidity, paired with temperature there so the gap is readable
  // on one axis — moves to a line count: exactly two curves means dew point is
  // not secretly plotted here too.
  it("plots temperature and feels-like and nothing else", () => {
    const { container } = render(<TempPanel data={data} />);
    expect(container.querySelectorAll("path.recharts-line-curve")).toHaveLength(2);
  });

  it("does not anchor the °C axis at zero", () => {
    // Recharts' default (and its 'auto') snap the lower bound to 0 for all-positive
    // data, which wasted the bottom third of the panel on temperatures that never
    // occur. Temperature is an interval scale — zero is not a meaningful baseline.
    const warm = data.map(d => ({ ...d, temp: 20, feelsLike: 22 }));
    const { container } = render(<TempPanel data={warm} />);
    const ticks = [...container.querySelectorAll("text")]
      .map(t => t.textContent)
      .filter(t => /^-?\d+$/.test(t || ""));
    expect(ticks).not.toContain("0");
    expect(ticks.length).toBeGreaterThan(0);
  });


  it("shades the hours between sunset and sunrise", () => {
    const { container } = render(
      <TempPanel data={data} nightBands={[{ start: data[0].x, end: data[6].x }]} />,
    );
    expect(container.querySelectorAll(`.${BANDS.night}`)).toHaveLength(1);
  });

});
