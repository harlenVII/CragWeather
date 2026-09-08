import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DewPointPanel } from "@/components/DewPointPanel";
import { GOOD_MAX_C, GREASY_MIN_C } from "@/lib/dewPointBands";

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

function series(dewPoint: number | ((i: number) => number)) {
  return Array.from({ length: 24 }, (_, i) => ({
    x: `2026-01-01T${String(i).padStart(2, "0")}:00`,
    dewPoint: typeof dewPoint === "function" ? dewPoint(i) : dewPoint,
  }));
}

const data = series(3);

// Recharts renders a ReferenceArea as <path class="recharts-reference-area-rect">,
// not <rect>. These fills identify the two friction bands; the weekend band uses
// amber (#f59e0b) and is deliberately a different hue so the two never merge.
const band = (c: HTMLElement, fill: string) =>
  c.querySelectorAll(`path.recharts-reference-area-rect[fill="${fill}"]`);
const goodRects = (c: HTMLElement) => band(c, "#0284c7");
const greasyRects = (c: HTMLElement) => band(c, "#e11d48");

describe("DewPointPanel", () => {
  it("plots dew point alone", () => {
    render(<DewPointPanel data={data} />);
    expect(screen.getByText("Dew point (°C)")).toBeInTheDocument();
  });

  it("does not plot temperature", () => {
    // Temperature was removed on purpose. Air temperature approaching the dew
    // point is not what wets rock — a surface colder than the dew point is — so
    // the gap between the two lines invited a reading the data cannot support.
    // Temperature stays one panel up on the same x-axis, and in the hover strip.
    const { container } = render(<DewPointPanel data={data} />);
    expect(screen.queryByText("Temp (°C)")).toBeNull();
    expect(container.querySelectorAll("path.recharts-line-curve")).toHaveLength(1);
  });

  it("draws both friction bands", () => {
    const { container } = render(<DewPointPanel data={data} />);
    expect(goodRects(container)).toHaveLength(1);
    expect(greasyRects(container)).toHaveLength(1);
  });

  it("labels the bands so the cue reads without the caption", () => {
    render(<DewPointPanel data={data} />);
    expect(screen.getByText("good friction")).toBeInTheDocument();
    expect(screen.getByText("greasy")).toBeInTheDocument();
  });

  it("keeps both bands on scale for a cool crag that never nears the greasy line", () => {
    // Regression guard for the reason dewPointDomain exists: auto-fitting 6–9°C
    // puts 15°C outside the domain and Recharts discards that ReferenceArea
    // entirely, leaving a panel that shows one threshold and hides the other.
    const cool = series(i => 6 + (i % 4));
    const { container } = render(<DewPointPanel data={cool} />);
    expect(goodRects(container)).toHaveLength(1);
    expect(greasyRects(container)).toHaveLength(1);
  });

  it("keeps both bands on scale for a humid crag sitting above the greasy line", () => {
    const humid = series(i => 18 + (i % 3));
    const { container } = render(<DewPointPanel data={humid} />);
    expect(goodRects(container)).toHaveLength(1);
    expect(greasyRects(container)).toHaveLength(1);
  });

  it("renders the bands behind the dew-point line, not over it", () => {
    // Painted in DOM order: a band emitted after the line would tint the very
    // series the reader is trying to trace.
    const { container } = render(<DewPointPanel data={data} />);
    const nodes = [...container.querySelectorAll(
      "path.recharts-reference-area-rect, path.recharts-line-curve",
    )].map(n => n.getAttribute("class")!.includes("reference-area") ? "band" : "line");
    expect(nodes).toEqual(["band", "band", "line"]);
  });

  it("does not anchor the °C axis at zero", () => {
    const warm = series(16);
    const { container } = render(<DewPointPanel data={warm} />);
    const ticks = [...container.querySelectorAll("text")]
      .map(t => t.textContent)
      .filter(t => /^-?\d+$/.test(t || ""));
    expect(ticks).not.toContain("0");
    expect(ticks.length).toBeGreaterThan(0);
  });

  it("extends the axis below sub-zero dew points instead of clipping them", () => {
    const winter = series(-11);
    const { container } = render(<DewPointPanel data={winter} />);
    const ticks = [...container.querySelectorAll("text")]
      .map(t => Number(t.textContent))
      .filter(Number.isFinite);
    expect(Math.min(...ticks)).toBeLessThan(-11);
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(GREASY_MIN_C);
    expect(Math.min(...ticks)).toBeLessThanOrEqual(GOOD_MAX_C);
  });

  it("keeps one shared axis", () => {
    const { container } = render(<DewPointPanel data={data} />);
    expect(container.querySelectorAll(".recharts-yAxis")).toHaveLength(1);
  });

  it("renders no model labels or section dividers", () => {
    // Model provenance is stated once, on panel 1. Repeating it here would imply
    // the stitch differs per panel.
    const { container } = render(<DewPointPanel data={data} />);
    expect(container.querySelectorAll('[stroke="#d1d5db"]')).toHaveLength(0);
  });
});
