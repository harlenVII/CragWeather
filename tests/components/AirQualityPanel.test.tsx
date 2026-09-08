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

  it("shades a leading null run as well as a trailing one", () => {
    // A viewer west of a crag (or any /at/[coords] page east of the viewer) can
    // see the joined series open with a null run before AQ coverage starts, not
    // just tail off at the end. Both must be shaded, not only the trailing one.
    const leadingAndTrailing = hours.map((x, i) => ({
      x,
      aqi: i < 4 || i >= 20 ? null : 40,
    }));
    const { container } = render(<AirQualityPanel data={leadingAndTrailing} />);
    expect(container.querySelectorAll('[fill="#6b7280"]')).toHaveLength(2);
  });

  it("paints no weekend band even when one is passed in", () => {
    // Deliberate design decision, guarded here: the weekend band is amber, which on
    // an AQI chart is the colour of "Unhealthy for sensitive groups" — an amber
    // Saturday column would read as pollution. The panel has no weekendBands prop,
    // and passing one anyway must stay inert. The cast is the point: it simulates a
    // caller that expects the prop to work, so this fails if support is ever added.
    const props = { data: clean, weekendBands: [{ start: hours[0], end: hours[5] }] };
    const { container } = render(
      <AirQualityPanel {...(props as React.ComponentProps<typeof AirQualityPanel>)} />,
    );
    expect(container.querySelectorAll('[fill="#f59e0b"]')).toHaveLength(0);
  });

  it("paints no night band even when one is passed in", () => {
    // Same class of decision as the weekend band above: this panel already uses
    // grey (#6b7280) to mean "CAMS does not forecast these hours". A second grey
    // meaning "night" would make the dead zone unreadable.
    const props = { data: clean, nightBands: [{ start: hours[0], end: hours[5] }] };
    const { container } = render(
      <AirQualityPanel {...(props as React.ComponentProps<typeof AirQualityPanel>)} />,
    );
    expect(container.querySelectorAll('[fill="#475569"]')).toHaveLength(0);
  });
});
