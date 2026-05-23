import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { HourlyWeather } from "@/lib/weather";

// WeatherView renders the incomplete-data warning when forecastHourly.length < days * 24.
// This component mirrors that logic for unit testing purposes.
function ForecastWarning({ hourly, days }: { hourly: HourlyWeather[]; days: number }) {
  return (
    <>
      {hourly.length < days * 24 && (
        <p className="weather-warning">
          Some weather data is unavailable — forecast may be incomplete.
        </p>
      )}
    </>
  );
}

const makeHourly = (n: number): HourlyWeather[] =>
  Array.from({ length: n }, (_, i) => ({
    datetime: `2026-01-01T${String(i % 24).padStart(2, "0")}:00`,
    temp: 10,
    precip: 0,
    windSpeed: 10,
    windGust: 15,
  }));

describe("ForecastWarning — missing data banner", () => {
  it("shows banner when forecast hours are fewer than days * 24", () => {
    render(<ForecastWarning hourly={makeHourly(100)} days={7} />);
    expect(screen.getByText(/Some weather data is unavailable/)).toBeInTheDocument();
  });

  it("does not show banner when forecast hours equal days * 24", () => {
    render(<ForecastWarning hourly={makeHourly(7 * 24)} days={7} />);
    expect(screen.queryByText(/Some weather data is unavailable/)).toBeNull();
  });

  it("does not show banner for 16d when all 16 * 24 hours present", () => {
    render(<ForecastWarning hourly={makeHourly(16 * 24)} days={16} />);
    expect(screen.queryByText(/Some weather data is unavailable/)).toBeNull();
  });

  it("shows banner for 16d when hours are short", () => {
    render(<ForecastWarning hourly={makeHourly(14 * 24)} days={16} />);
    expect(screen.getByText(/Some weather data is unavailable/)).toBeInTheDocument();
  });
});
