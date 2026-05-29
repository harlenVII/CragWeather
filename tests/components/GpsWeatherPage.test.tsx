import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { WeatherResponse } from "@/lib/weather";

const notFoundMock = vi.hoisted(() => vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

const fetchWeatherMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/weather", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/weather")>()),
  fetchWeather: fetchWeatherMock,
}));

const { default: GpsWeatherPage } = await import("@/app/at/[coords]/page");

const fixture: WeatherResponse = {
  daily: [{ date: "2026-05-29", tempMax: 20, tempMin: 8, precip: 0 }],
  hourly: [{ datetime: "2026-05-29T12:00", temp: 18, precip: 0, windSpeed: 3, windGust: 5 }],
};

beforeEach(() => {
  notFoundMock.mockClear();
  fetchWeatherMock.mockReset();
  localStorage.clear();
});

describe("GpsWeatherPage", () => {
  it("renders the formatted coordinates and weather for valid coords", async () => {
    fetchWeatherMock.mockResolvedValue(fixture);
    render(await GpsWeatherPage({ params: Promise.resolve({ coords: "37.7340,-119.6370" }) }));
    expect(screen.getByRole("heading", { name: "37.7340, -119.6370" })).toBeInTheDocument();
    expect(fetchWeatherMock).toHaveBeenCalledWith(37.734, -119.637);
    // WeatherView renders the day-window picker
    expect(screen.getByRole("button", { name: "7d" })).toBeInTheDocument();
  });

  it("calls notFound for unparseable coords", async () => {
    await expect(
      GpsWeatherPage({ params: Promise.resolve({ coords: "not-coords" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("shows the unavailable message when fetchWeather fails", async () => {
    fetchWeatherMock.mockRejectedValue(new Error("upstream"));
    render(await GpsWeatherPage({ params: Promise.resolve({ coords: "48.0,11.0" }) }));
    expect(screen.getByText(/weather unavailable/i)).toBeInTheDocument();
  });
});
