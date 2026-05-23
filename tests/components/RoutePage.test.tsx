import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { HourlyWeather } from "@/lib/weather";

function WeatherSection({ hourly }: { hourly: HourlyWeather[] }) {
  return (
    <>
      {hourly.length < 32 * 24 && (
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

describe("WeatherSection — missing data banner", () => {
  it("shows banner when hourly count is less than 768", () => {
    render(<WeatherSection hourly={makeHourly(700)} />);
    expect(screen.getByText(/Some weather data is unavailable/)).toBeInTheDocument();
  });

  it("does not show banner when hourly count is 768", () => {
    render(<WeatherSection hourly={makeHourly(768)} />);
    expect(screen.queryByText(/Some weather data is unavailable/)).toBeNull();
  });
});
