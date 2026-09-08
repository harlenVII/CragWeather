import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AirQualityPanel } from "@/components/AirQualityPanel";
import { AQI_AXIS_FLOOR } from "@/lib/aqiBands";

// Recharts' ResponsiveContainer measures 0x0 in jsdom and renders no chart body.
// Give it an explicit size so the legend, line, bands and axes reach the DOM.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <actual.ResponsiveContainer width={800} height={300}>{children}</actual.ResponsiveContainer>
    ),
  };
});

const hours = Array.from({ length: 24 }, (_, i) => `2026-09-08T${String(i).padStart(2, "0")}:00`);

// Clean air with a trailing tail, the shape CAMS actually returns.
const clean = hours.map((x, i) => ({ x, aqi: i < 16 ? 40 : null }));

describe("AirQualityPanel", () => {
  it("renders the AQI series in the legend", () => {
    render(<AirQualityPanel data={clean} />);
    expect(screen.getByText("US AQI")).toBeInTheDocument();
  });

  it("holds the axis at the floor for clean air", () => {
    // The panel's whole reason for a floored ceiling: a 40-AQI day must not be
    // drawn as a full-height line. getByText("100") is unique among the ticks.
    render(<AirQualityPanel data={clean} />);
    expect(screen.getByText(String(AQI_AXIS_FLOOR))).toBeInTheDocument();
  });

  it("draws exactly the two low bands for clean air", () => {
    // A clean crag should be a calm two-tone panel, not a permanent rainbow.
    const { container } = render(<AirQualityPanel data={clean} />);
    expect(container.querySelectorAll('[fill="#00e400"]')).toHaveLength(1);
    expect(container.querySelectorAll('[fill="#ffff00"]')).toHaveLength(1);
    expect(container.querySelectorAll('[fill="#ff7e00"]')).toHaveLength(0);
    expect(container.querySelectorAll('[fill="#ff0000"]')).toHaveLength(0);
  });

  it("reveals the higher bands during a smoke event", () => {
    const smoky = hours.map((x, i) => ({ x, aqi: i < 16 ? 210 : null }));
    const { container } = render(<AirQualityPanel data={smoky} />);
    expect(container.querySelectorAll('[fill="#ff7e00"]')).toHaveLength(1);
    expect(container.querySelectorAll('[fill="#ff0000"]')).toHaveLength(1);
    expect(container.querySelectorAll('[fill="#8f3f97"]')).toHaveLength(1);
  });

  it("shades the hours the forecast does not reach", () => {
    const { container } = render(<AirQualityPanel data={clean} />);
    expect(container.querySelectorAll('[fill="#6b7280"]')).toHaveLength(1);
  });

  it("draws no dead zone when the series covers the whole window", () => {
    const full = hours.map(x => ({ x, aqi: 40 }));
    const { container } = render(<AirQualityPanel data={full} />);
    expect(container.querySelectorAll('[fill="#6b7280"]')).toHaveLength(0);
  });

  it("never renders weekend bands", () => {
    // Deliberate: the weekend band is amber, which on an AQI chart is the colour
    // of "Unhealthy for sensitive groups". A reader could take the amber Saturday
    // column for pollution. The weekend cue is carried by the five panels above.
    const { container } = render(<AirQualityPanel data={clean} />);
    expect(container.querySelectorAll('[fill="#f59e0b"]')).toHaveLength(0);
  });
});
