import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrecipPanel } from "@/components/PrecipPanel";

// Recharts' ResponsiveContainer measures 0x0 in jsdom and renders no chart body.
// Give it an explicit size so the legend, bars and axes reach the DOM.
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
  precip: i % 3,
  chance: i * 4,
}));

describe("PrecipPanel", () => {
  it("renders both series in the legend", () => {
    render(<PrecipPanel data={data} />);
    expect(screen.getByText("Precip (mm)")).toBeInTheDocument();
    expect(screen.getByText("Chance (%)")).toBeInTheDocument();
  });

  it("renders with a null chance without crashing", () => {
    const withNull = data.map((d, i) => ({ ...d, chance: i === 5 ? null : d.chance }));
    render(<PrecipPanel data={withNull} />);
    expect(screen.getByText("Chance (%)")).toBeInTheDocument();
  });

  it("pins the percent axis to 0-100 regardless of the data range", () => {
    // All chances are single-digit; a fitted domain would stretch them to full height.
    const flat = data.map(d => ({ ...d, chance: 3 }));
    render(<PrecipPanel data={flat} />);
    expect(screen.getByText("100")).toBeInTheDocument();
  });
});
