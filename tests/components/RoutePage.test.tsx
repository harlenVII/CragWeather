import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const headersMock = vi.hoisted(() =>
  vi.fn(async () => new Map([["host", "localhost:3000"]]) as unknown as Headers),
);
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

const { default: RoutePage } = await import("@/app/route/[id]/page");

const apiResponse = {
  route: {
    id: 105748662,
    name: "The Nose",
    slug: "the-nose",
    area: "Yosemite > El Capitan",
    grade: "5.14a",
    lat: 47.55425,
    lng: -121.54968,
    mpUrl: "https://www.mountainproject.com/route/105748662/the-nose",
  },
  weather: {
    daily: [{ date: "2026-05-29", tempMax: 20, tempMin: 8, precip: 0 }],
    hourly: [{ datetime: "2026-05-29T12:00", temp: 18, precip: 0, windSpeed: 3, windGust: 5 }],
  },
};

describe("RoutePage — external links", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(apiResponse), { status: 200 })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("links to the Windy map for the route coordinates", async () => {
    render(await RoutePage({ params: Promise.resolve({ id: "105748662" }) }));
    const link = screen.getByRole("link", { name: /view on windy/i });
    expect(link).toHaveAttribute("href", "https://www.windy.com/47.554/-121.550");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("stores the route coordinates when it is saved", async () => {
    render(await RoutePage({ params: Promise.resolve({ id: "105748662" }) }));
    await userEvent.click(screen.getByRole("button", { name: /save route/i }));

    const stored = JSON.parse(localStorage.getItem("cw_favorites")!);
    expect(stored[0]).toMatchObject({
      id: 105748662,
      name: "The Nose",
      lat: 47.55425,
      lng: -121.54968,
    });
  });

  it("still links to Mountain Project", async () => {
    render(await RoutePage({ params: Promise.resolve({ id: "105748662" }) }));
    expect(screen.getByRole("link", { name: /view on mountain project/i })).toHaveAttribute(
      "href",
      "https://www.mountainproject.com/route/105748662/the-nose",
    );
  });
});
