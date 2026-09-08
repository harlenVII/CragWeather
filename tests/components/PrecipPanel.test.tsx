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

  it("splits the chance line into two subpaths around a null gap", () => {
    // connectNulls={false}: a null mid-array must break the line's SVG path into two
    // "M" (moveto) subpaths rather than being bridged into a fabricated straight line.
    const withNull = data.map((d, i) => ({ ...d, chance: i === 5 ? null : d.chance }));
    const { container } = render(<PrecipPanel data={withNull} />);
    const path = container.querySelector("path.recharts-line-curve");
    expect(path).not.toBeNull();
    const dAttr = path?.getAttribute("d") ?? "";
    expect(dAttr.match(/M/g)).toHaveLength(2);
  });

  it("floors the mm axis so a trace of drizzle is not stretched to full height", () => {
    // 0.1mm/h is drizzle. Auto-fitting would put the axis at 0-0.1 and draw it as
    // a full-height bar reading as a downpour; the floor keeps it at ~2.5% height.
    const drizzle = data.map(d => ({ ...d, precip: 0.1 }));
    render(<PrecipPanel data={drizzle} />);
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("still lets the mm axis grow past the floor for real rain", () => {
    // The floor must never clip genuine weather — silently truncating a downpour
    // would be worse than the bug it fixes. Note a plain `domain={[0, 4]}` does
    // NOT clip: Recharts treats a too-small domain as a hint and expands it to
    // fit the data unless `allowDataOverflow` is set. This assertion is what
    // catches that combination.
    const downpour = data.map((d, i) => ({ ...d, precip: i === 2 ? 12 : 0 }));
    render(<PrecipPanel data={downpour} />);
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("pins the percent axis to 0-100 regardless of the data range", () => {
    // All chances are single-digit; a fitted domain would stretch them to full height.
    const flat = data.map(d => ({ ...d, chance: 3 }));
    render(<PrecipPanel data={flat} />);
    expect(screen.getByText("100")).toBeInTheDocument();
  });
});
