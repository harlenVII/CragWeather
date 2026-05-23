import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DailyCards } from "@/components/DailyCards";
import type { DailyWeather, HourlyWeather } from "@/lib/weather";

const day = (date: string, max: number, min: number, precip: number, model?: string): DailyWeather => ({
  date, tempMax: max, tempMin: min, precip, model,
});
const hr = (datetime: string, t: number, p: number): HourlyWeather => ({ datetime, temp: t, precip: p });

describe("DailyCards", () => {
  it("renders 14 cards", () => {
    const daily = Array.from({ length: 14 }, (_, i) => day(`2026-01-${String(i + 1).padStart(2, "0")}`, 10, 0, 0));
    const hourly = Array.from({ length: 14 * 24 }, (_, i) => hr(`2026-01-01T${String(i % 24).padStart(2, "0")}:00`, 5, 0));
    render(<DailyCards daily={daily} hourly={hourly} />);
    expect(screen.getAllByRole("button")).toHaveLength(14);
  });

  it("shows model badge when model is set", () => {
    const daily = [day("2026-01-01", 12, 2, 1, "HRRR")];
    render(<DailyCards daily={daily} hourly={[]} />);
    expect(screen.getByText("HRRR")).toBeInTheDocument();
  });

  it("shows no badge when model is undefined", () => {
    const daily = [day("2026-01-01", 12, 2, 1)];
    render(<DailyCards daily={daily} hourly={[]} />);
    expect(screen.queryByText("HRRR")).toBeNull();
    expect(screen.queryByText("NAM")).toBeNull();
    expect(screen.queryByText("GFS")).toBeNull();
    expect(screen.queryByText("ERA5")).toBeNull();
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
