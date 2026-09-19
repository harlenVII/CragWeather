import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PanelLabel } from "@/components/PanelLabel";
import { SERIES } from "@/lib/chartColors";

describe("PanelLabel", () => {
  it("renders the panel title", () => {
    render(<PanelLabel title="Temperature" series={[]} />);
    expect(screen.getByText("Temperature")).toBeInTheDocument();
  });

  it("renders each series name verbatim", () => {
    // These strings are the app's contract: five existing panel tests read them
    // with getByText, and they used to come from the Recharts <Legend/>.
    render(
      <PanelLabel
        title="Temperature"
        series={[
          { name: "Temp (°C)", className: SERIES.temp },
          { name: "Feels like (°C)", className: SERIES.feelsLike, dashed: true },
        ]}
      />,
    );
    expect(screen.getByText("Temp (°C)")).toBeInTheDocument();
    expect(screen.getByText("Feels like (°C)")).toBeInTheDocument();
  });

  it("marks a dashed series so the swatch can differ, alongside its color class", () => {
    // SERIES exports CSS class names, not color strings (Task 5) — the swatch
    // is painted by a `.panel-label__swatch.series-*` rule in components.css,
    // so the class must land on the same element as the dashed modifier.
    const { container } = render(
      <PanelLabel title="T" series={[{ name: "Feels like (°C)", className: SERIES.feelsLike, dashed: true }]} />,
    );
    const swatch = container.querySelector(".panel-label__swatch--dashed");
    expect(swatch).not.toBeNull();
    expect(swatch).toHaveClass(SERIES.feelsLike);
  });
});
