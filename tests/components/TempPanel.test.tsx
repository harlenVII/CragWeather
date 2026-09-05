import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TempPanel } from "@/components/TempPanel";

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
  dewPoint: 3,
}));

describe("TempPanel", () => {
  it("renders all three series in the legend", () => {
    render(<TempPanel data={data} />);
    expect(screen.getByText("Temp (°C)")).toBeInTheDocument();
    expect(screen.getByText("Feels like (°C)")).toBeInTheDocument();
    expect(screen.getByText("Dew point (°C)")).toBeInTheDocument();
  });

  it("renders a model label and a divider for each section boundary", () => {
    const { container } = render(
      <TempPanel
        data={data}
        sections={[
          { model: "HRRR", start: data[0].x,  mid: data[2].x,  end: data[4].x },
          { model: "NAM",  start: data[5].x,  mid: data[8].x,  end: data[11].x },
        ]}
      />,
    );
    expect(screen.getByText("HRRR")).toBeInTheDocument();
    expect(screen.getByText("NAM")).toBeInTheDocument();
    // One divider per boundary after the first: 2 sections → 1 divider line.
    const dividers = container.querySelectorAll('[stroke="#d1d5db"]');
    expect(dividers).toHaveLength(1);
  });
});
