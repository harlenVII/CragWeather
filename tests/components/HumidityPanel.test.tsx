import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HumidityPanel } from "@/components/HumidityPanel";

// Recharts' ResponsiveContainer measures 0x0 in jsdom and renders no chart body.
// Give it an explicit size so the legend, line and axes reach the DOM.
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
  humidity: 40 + i,
}));

describe("HumidityPanel", () => {
  // The old getByText("Humidity (%)") legend check moved to
  // ForecastChart.test.tsx, where PanelLabel (which now owns that text)
  // actually renders — this panel no longer has a legend to read.
  it("plots the humidity series", () => {
    const { container } = render(<HumidityPanel data={data} />);
    expect(container.querySelectorAll("path.recharts-line-curve")).toHaveLength(1);
  });

  it("pins the axis to 0-100 regardless of the data range", () => {
    // All humidity is 50; a fitted domain would not produce a 100 tick.
    // Assert only on "100" — "0" matches multiple tick elements.
    render(<HumidityPanel data={data.map(d => ({ ...d, humidity: 50 }))} />);
    expect(screen.getByText("100")).toBeInTheDocument();
  });
});
