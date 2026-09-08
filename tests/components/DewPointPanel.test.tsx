import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DewPointPanel } from "@/components/DewPointPanel";

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
  dewPoint: 3,
}));

describe("DewPointPanel", () => {
  it("renders both series in the legend", () => {
    render(<DewPointPanel data={data} />);
    expect(screen.getByText("Temp (°C)")).toBeInTheDocument();
    expect(screen.getByText("Dew point (°C)")).toBeInTheDocument();
  });

  it("plots both lines on one shared axis so the gap between them is readable", () => {
    // A second YAxis would rescale the two series independently and destroy the
    // comparison this panel exists to make: converging lines mean condensation.
    const { container } = render(<DewPointPanel data={data} />);
    expect(container.querySelectorAll(".recharts-yAxis")).toHaveLength(1);
    expect(container.querySelectorAll("path.recharts-line-curve")).toHaveLength(2);
  });

  it("does not anchor the °C axis at zero", () => {
    const warm = data.map(d => ({ ...d, temp: 20, dewPoint: 16 }));
    const { container } = render(<DewPointPanel data={warm} />);
    const ticks = [...container.querySelectorAll("text")]
      .map(t => t.textContent)
      .filter(t => /^-?\d+$/.test(t || ""));
    expect(ticks).not.toContain("0");
    expect(ticks.length).toBeGreaterThan(0);
  });

  it("renders no model labels or section dividers", () => {
    // Model provenance is stated once, on panel 1. Repeating it here would imply
    // the stitch differs per panel.
    const { container } = render(<DewPointPanel data={data} />);
    expect(container.querySelectorAll('[stroke="#d1d5db"]')).toHaveLength(0);
  });
});
