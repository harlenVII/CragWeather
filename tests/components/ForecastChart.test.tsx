import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ForecastChart } from "@/components/ForecastChart";
import type { HourlyWeather } from "@/lib/weather";

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

describe("ForecastChart air quality", () => {
  it("renders the panel and names the cutoff hour when AQ is present", () => {
    render(<ForecastChart hourly={hourly} air={air} />);
    // "US AQI" legitimately appears twice when the panel renders: once as the
    // Recharts legend label (AirQualityPanel's Line name="US AQI") and once in
    // the explainer's <strong>US AQI</strong> — getByText throws on that
    // ambiguity. "AQI" alone is unambiguous: it is the panel's y-axis label
    // and nothing else on the page reads exactly "AQI" (as opposed to "US
    // AQI"), so it pins the panel's presence specifically, not just "something
    // AQI-related rendered somewhere."
    expect(screen.getByText("AQI")).toBeInTheDocument();
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
    expect(screen.getByText("AQI")).toBeInTheDocument();
    expect(screen.queryByText(/does not forecast further ahead/)).toBeNull();
  });
});
