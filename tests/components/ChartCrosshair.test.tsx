import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { createRef } from "react";
import { ChartCrosshair } from "@/components/ChartCrosshair";

/** A stand-in for .chart-inner holding one rendered x-axis line, which is the
 *  only thing the crosshair measures. Recharts renders nothing under jsdom
 *  (ResponsiveContainer measures 0x0), so the axis is supplied by hand — and
 *  that is the whole contract: the component reads x1/x2 off one axis line and
 *  derives every position from them. */
function harness(x1: number, x2: number) {
  const host = document.createElement("div");
  host.innerHTML = `
    <svg>
      <g class="recharts-xAxis">
        <line class="recharts-cartesian-axis-line" x1="${x1}" x2="${x2}" y1="0" y2="0"></line>
      </g>
    </svg>`;
  document.body.appendChild(host);
  const ref = createRef<HTMLDivElement>();
  Object.defineProperty(ref, "current", { value: host, writable: true });
  return { host, ref };
}

describe("ChartCrosshair", () => {
  it("renders nothing when no hour is active", () => {
    const { ref } = harness(60, 760);
    const { container } = render(<ChartCrosshair index={null} count={24} containerRef={ref} />);
    expect(container.querySelector(".chart-crosshair")).toBeNull();
  });

  it("positions at the centre of the hovered band", () => {
    // Plot spans 60..760 = 700px over 24 bands, so each band is 29.1667px and
    // the centre of band 0 is 60 + 0.5 * 29.1667 = 74.58px.
    const { ref } = harness(60, 760);
    const { container } = render(<ChartCrosshair index={0} count={24} containerRef={ref} />);
    const line = container.querySelector<HTMLElement>(".chart-crosshair");
    expect(line).not.toBeNull();
    expect(parseFloat(line!.style.left)).toBeCloseTo(74.58, 1);
  });

  it("positions the last band inside the plot area", () => {
    // Centre of band 23 = 60 + 23.5 * 29.1667 = 745.42px — inside 760.
    const { ref } = harness(60, 760);
    const { container } = render(<ChartCrosshair index={23} count={24} containerRef={ref} />);
    const line = container.querySelector<HTMLElement>(".chart-crosshair");
    expect(parseFloat(line!.style.left)).toBeCloseTo(745.42, 1);
  });

  it("renders nothing when the axis has not been measured yet", () => {
    const empty = createRef<HTMLDivElement>();
    const { container } = render(<ChartCrosshair index={3} count={24} containerRef={empty} />);
    expect(container.querySelector(".chart-crosshair")).toBeNull();
  });

  it("renders nothing for an empty series", () => {
    const { ref } = harness(60, 760);
    const { container } = render(<ChartCrosshair index={0} count={0} containerRef={ref} />);
    expect(container.querySelector(".chart-crosshair")).toBeNull();
  });

  it("measures an axis that appears after mount", async () => {
    // Recharts only emits its SVG once its own ResizeObserver has reported a
    // width, which can land after this component's effect. The panels have fixed
    // heights, so .chart-inner never resizes when the charts appear — a
    // ResizeObserver alone would never re-measure and the line would never draw.
    const host = document.createElement("div");
    document.body.appendChild(host);
    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, "current", { value: host, writable: true });

    const { container } = render(<ChartCrosshair index={0} count={24} containerRef={ref} />);
    expect(container.querySelector(".chart-crosshair")).toBeNull();

    host.innerHTML = `
      <svg>
        <g class="recharts-xAxis">
          <line class="recharts-cartesian-axis-line" x1="60" x2="760" y1="0" y2="0"></line>
        </g>
      </svg>`;

    await new Promise(resolve => setTimeout(resolve, 0));
    const line = container.querySelector<HTMLElement>(".chart-crosshair");
    expect(line).not.toBeNull();
    expect(parseFloat(line!.style.left)).toBeCloseTo(74.58, 1);
  });

  it("re-measures when a hover starts, so a resize cannot leave it one step stale", async () => {
    // On a resize this component's ResizeObserver and Recharts' own fire in the
    // same delivery with no ordering guarantee, so a measurement taken then can
    // read the pre-resize axis. Here the axis is moved without any observer
    // firing — the MutationObserver disconnected after the first successful
    // measure, and the jsdom ResizeObserver stub is a no-op — which is precisely
    // the stale-extent case. Starting a hover must correct it.
    const { host, ref } = harness(60, 760);
    const { container, rerender } = render(
      <ChartCrosshair index={null} count={24} containerRef={ref} />,
    );
    await new Promise(resolve => setTimeout(resolve, 0));

    const line = host.querySelector(".recharts-cartesian-axis-line")!;
    line.setAttribute("x1", "0");
    line.setAttribute("x2", "800");

    rerender(<ChartCrosshair index={0} count={24} containerRef={ref} />);
    // Centre of band 0 on the NEW extent: 0 + 0.5 * 800 / 24 = 16.67px. On the
    // stale one it would still read 74.58px.
    expect(parseFloat(container.querySelector<HTMLElement>(".chart-crosshair")!.style.left))
      .toBeCloseTo(16.67, 1);
  });

  it("ignores a degenerate axis", () => {
    const { ref } = harness(200, 200);
    const { container } = render(<ChartCrosshair index={0} count={24} containerRef={ref} />);
    expect(container.querySelector(".chart-crosshair")).toBeNull();
  });
});
