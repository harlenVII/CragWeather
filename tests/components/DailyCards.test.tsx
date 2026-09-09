import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DailyCards } from "@/components/DailyCards";
import type { DailyWeather, HourlyWeather } from "@/lib/weather";

const day = (date: string, max: number, min: number, precip: number): DailyWeather => ({
  date, tempMax: max, tempMin: min, precip,
});
const hr = (datetime: string, t: number, p: number): HourlyWeather =>
  ({ datetime, temp: t, feelsLike: t, dewPoint: 5, humidity: 60, precip: p, precipChance: 20, windSpeed: 10, windGust: 15 });

describe("DailyCards", () => {
  it("renders 14 cards", () => {
    const daily = Array.from({ length: 14 }, (_, i) => day(`2026-01-${String(i + 1).padStart(2, "0")}`, 10, 0, 0));
    const hourly = Array.from({ length: 14 * 24 }, (_, i) => hr(`2026-01-01T${String(i % 24).padStart(2, "0")}:00`, 5, 0));
    render(<DailyCards daily={daily} hourly={hourly} />);
    expect(screen.getAllByRole("button")).toHaveLength(14);
  });





  it("shows sunrise and sunset times on a card", () => {
    const daily = [{ ...day("2026-01-15", 12, 2, 1), sunrise: "2026-01-15T06:34", sunset: "2026-01-15T19:17" }];
    render(<DailyCards daily={daily} hourly={[]} />);
    expect(screen.getByText("06:34")).toBeInTheDocument();
    expect(screen.getByText("19:17")).toBeInTheDocument();
  });

  it("omits the sun row entirely when a day has no sun times", () => {
    // Open-Meteo returns null for both above the arctic circle.
    render(<DailyCards daily={[day("2026-01-15", 12, 2, 1)]} hourly={[]} />);
    expect(screen.queryByTestId("card-sun")).toBeNull();
  });

  it("expands hourly detail on card click", async () => {
    const daily = [day("2026-01-01", 12, 2, 1)];
    const hourly = Array.from({ length: 24 }, (_, h) =>
      hr(`2026-01-01T${String(h).padStart(2, "0")}:00`, h, 0),
    );
    render(<DailyCards daily={daily} hourly={hourly} />);
    expect(screen.queryByText(/00:00/)).toBeNull();
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/00:00/)).toBeInTheDocument();
    expect(screen.getByText(/23:00/)).toBeInTheDocument();
  });
});
