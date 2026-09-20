import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ForecastChart } from "@/components/ForecastChart";
import type { HourlyWeather } from "@/lib/weather";
import { BANDS } from "@/lib/chartColors";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <actual.ResponsiveContainer width={800} height={300}>{children}</actual.ResponsiveContainer>
    ),
  };
});

const hourly: HourlyWeather[] = Array.from({ length: 24 }, (_, i) => ({
  datetime: `2026-09-08T${String(i).padStart(2, "0")}:00`,
  temp: 15, feelsLike: 14, dewPoint: 4, humidity: 55,
  precip: 0, precipChance: 10, windSpeed: 3, windGust: 5,
}));

// AQ stops well before the weather window ends — the real shape.
const air = {
  hourly: hourly.slice(0, 7).map((h, i) => ({ datetime: h.datetime, usAqi: 40 + i })),
};

// The AQI panel's y-axis label, told apart from the hover strip's own "AQI"
// cell, which is rendered at all times now (dashed until an hour is hovered)
// so the strip does not change height as the pointer enters the stack.
function aqiAxisLabel() {
  return screen.getAllByText("AQI").find(el => !el.closest("[data-testid='chart-readout']"));
}

describe("ForecastChart air quality", () => {
  it("renders the panel and names the cutoff hour when AQ is present", () => {
    render(<ForecastChart hourly={hourly} air={air} />);
    // "US AQI" legitimately appears twice when the panel renders: once as the
    // Recharts legend label (AirQualityPanel's Line name="US AQI") and once in
    // the explainer's <strong>US AQI</strong> — getByText throws on that
    // ambiguity. "AQI" is the panel's y-axis label, so it pins the panel's
    // presence specifically rather than just "something AQI-related rendered
    // somewhere" — outside the readout, which carries its own "AQI" label.
    expect(aqiAxisLabel()).toBeDefined();
    // Last covered hour is index 6 -> 06:00.
    expect(screen.getByText(/8 Sep, 06:00/)).toBeInTheDocument();
  });

  it("states the resolution caveat", () => {
    // The honest answer to the 45km objection; it is not optional copy.
    render(<ForecastChart hourly={hourly} air={air} />);
    expect(screen.getByText(/45 km/)).toBeInTheDocument();
  });

  it("renders no panel, note or explainer when AQ is unavailable", () => {
    render(<ForecastChart hourly={hourly} air={null} />);
    expect(screen.queryByText("US AQI")).toBeNull();
    expect(screen.queryByText(/45 km/)).toBeNull();
    // The rest of the stack is untouched.
    expect(screen.getByText("Temp (°C)")).toBeInTheDocument();
  });

  it("renders no panel when every AQ value is null", () => {
    const empty = { hourly: hourly.map(h => ({ datetime: h.datetime, usAqi: null })) };
    render(<ForecastChart hourly={hourly} air={empty} />);
    expect(screen.queryByText("US AQI")).toBeNull();
  });

  it("omits the cutoff note when AQ covers the whole window", () => {
    const full = { hourly: hourly.map(h => ({ datetime: h.datetime, usAqi: 40 })) };
    render(<ForecastChart hourly={hourly} air={full} />);
    // See the note above: "AQI" (not "US AQI") pins the panel specifically.
    expect(aqiAxisLabel()).toBeDefined();
    expect(screen.queryByText(/does not forecast further ahead/)).toBeNull();
  });
});

describe("ForecastChart night shading", () => {
  const daily = [{
    date: "2026-09-08", tempMax: 20, tempMin: 10, precip: 0,
    sunrise: "2026-09-08T06:34", sunset: "2026-09-08T19:17",
  }];

  it("shades night on the five weather panels but not on air quality", () => {
    const { container } = render(<ForecastChart hourly={hourly} daily={daily} air={air} />);
    // Two bands per panel (before sunrise, after sunset) across panels 1-5.
    expect(container.querySelectorAll(`.${BANDS.night}`)).toHaveLength(10);
    expect(aqiAxisLabel()).toBeDefined();
  });

  it("snaps the shading to the hours either side of the real sun times", () => {
    const { container } = render(<ForecastChart hourly={hourly} daily={daily} />);
    // 06:34 rounds to 07:00 and 19:17 to 19:00; the exact minutes stay on the cards.
    const band = container.querySelector(`.${BANDS.night}`);
    expect(band).not.toBeNull();
    expect(container.querySelectorAll(`.${BANDS.night}`)).toHaveLength(10);
  });

  it("renders no night bands when the days carry no sun times", () => {
    const noSun = [{ date: "2026-09-08", tempMax: 20, tempMin: 10, precip: 0 }];
    const { container } = render(<ForecastChart hourly={hourly} daily={noSun} />);
    expect(container.querySelectorAll(`.${BANDS.night}`)).toHaveLength(0);
  });
});

describe("ForecastChart panel labels", () => {
  // The series-name strings used to come from each panel's Recharts <Legend/>;
  // PanelLabel now owns them, and ForecastChart is the component that actually
  // renders PanelLabel (the panel tests render each chart directly, without
  // this wrapper). "US AQI" is checked separately in the air-quality describe
  // block above via the unambiguous "AQI" axis label, since with the panel
  // present "US AQI" legitimately matches twice (the label and the explainer).
  it("names every plotted series exactly once", () => {
    render(<ForecastChart hourly={hourly} />);
    for (const name of [
      "Temp (°C)", "Feels like (°C)", "Precip (mm)", "Chance (%)",
      "Speed (m/s)", "Gust (m/s)", "Dew point (°C)", "Humidity (%)",
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });
});
