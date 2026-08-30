import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeatherChart } from "@/components/WeatherChart";
import type { DailyWeather } from "@/lib/weather";

const day = (date: string, partial?: boolean): DailyWeather => ({
  date, tempMax: 20, tempMin: 10, precip: 3, partial,
});

describe("WeatherChart", () => {
  it("captions the partial day with its cutoff hour", () => {
    render(<WeatherChart daily={[day("2026-05-14"), day("2026-05-15", true)]} nowHour={12} />);
    expect(screen.getByText(/05-15 is today so far/)).toBeInTheDocument();
    expect(screen.getByText(/through 12:00/)).toBeInTheDocument();
  });

  it("renders no caption when no day is partial", () => {
    render(<WeatherChart daily={[day("2026-05-13"), day("2026-05-14")]} nowHour={12} />);
    expect(screen.queryByText(/today so far/)).not.toBeInTheDocument();
  });
});
