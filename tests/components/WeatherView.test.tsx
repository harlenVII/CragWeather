import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeatherView } from "@/components/WeatherView";
import { localDayAndHour } from "@/lib/sliceWeather";
import type { DailyWeather, HourlyWeather } from "@/lib/weather";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <actual.ResponsiveContainer width={800} height={300}>{children}</actual.ResponsiveContainer>
    ),
  };
});

// WeatherView derives `today` from the clock, so the fixture is built around it
// rather than around a fixed date that would fall outside the forecast window.
const { today } = localDayAndHour(new Date());

const hourly: HourlyWeather[] = Array.from({ length: 24 }, (_, i) => ({
  datetime: `${today}T${String(i).padStart(2, "0")}:00`,
  temp: 15, feelsLike: 14, dewPoint: 4, humidity: 55,
  precip: 0, precipChance: 10, windSpeed: 3, windGust: 5,
}));

const daily: DailyWeather[] = [{
  date: today, tempMax: 20, tempMin: 10, precip: 0,
  sunrise: `${today}T06:34`, sunset: `${today}T19:17`,
}];

describe("WeatherView", () => {
  it("shades night on the forecast panels from the daily sun times", () => {
    const { container } = render(<WeatherView weather={{ daily, hourly }} />);
    expect(container.querySelectorAll('[fill="#475569"]').length).toBeGreaterThan(0);
  });

  it("shows the exact sun times on the day card", () => {
    render(<WeatherView weather={{ daily, hourly }} />);
    expect(screen.getByText("06:34")).toBeInTheDocument();
    expect(screen.getByText("19:17")).toBeInTheDocument();
  });

  it("renders no night shading when the days carry no sun times", () => {
    const noSun = [{ date: today, tempMax: 20, tempMin: 10, precip: 0 }];
    const { container } = render(<WeatherView weather={{ daily: noSun, hourly }} />);
    expect(container.querySelectorAll('[fill="#475569"]')).toHaveLength(0);
  });
});
