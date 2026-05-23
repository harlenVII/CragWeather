import { describe, expect, it } from "vitest";
import { sliceWeather } from "@/lib/sliceWeather";
import type { DailyWeather, HourlyWeather } from "@/lib/weather";

function makeDaily(date: string): DailyWeather {
  return { date, tempMax: 20, tempMin: 10, precip: 0 };
}

function makeHourly(datetime: string): HourlyWeather {
  return { datetime, temp: 15, precip: 0, windSpeed: 3, windGust: 5 };
}

// 32-day window centred on 2026-05-15:
// days 0-15 → 2026-04-29 … 2026-05-14 (history)
// days 16-31 → 2026-05-15 … 2026-05-30 (today + forecast)
const TODAY = "2026-05-15";
const daily: DailyWeather[] = Array.from({ length: 32 }, (_, i) => {
  const d = new Date("2026-04-29T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + i);
  return makeDaily(d.toISOString().slice(0, 10));
});
const hourly: HourlyWeather[] = daily.flatMap(d =>
  Array.from({ length: 24 }, (_, h) =>
    makeHourly(`${d.date}T${String(h).padStart(2, "0")}:00`),
  ),
);
const weather = { daily, hourly };

describe("sliceWeather", () => {
  it("forecastDaily: includes exactly N days starting from today", () => {
    const { forecastDaily } = sliceWeather(weather, TODAY, 7);
    expect(forecastDaily).toHaveLength(7);
    expect(forecastDaily[0].date).toBe("2026-05-15");
    expect(forecastDaily[6].date).toBe("2026-05-21");
  });

  it("forecastDaily: excludes days before today", () => {
    const { forecastDaily } = sliceWeather(weather, TODAY, 7);
    expect(forecastDaily.every(d => d.date >= TODAY)).toBe(true);
  });

  it("historyDaily: includes exactly N days ending before today", () => {
    const { historyDaily } = sliceWeather(weather, TODAY, 7);
    expect(historyDaily).toHaveLength(7);
    expect(historyDaily[0].date).toBe("2026-05-08");
    expect(historyDaily[6].date).toBe("2026-05-14");
  });

  it("historyDaily: excludes today and later", () => {
    const { historyDaily } = sliceWeather(weather, TODAY, 7);
    expect(historyDaily.every(d => d.date < TODAY)).toBe(true);
  });

  it("forecastHourly: includes only hours in N forecast days", () => {
    const { forecastHourly } = sliceWeather(weather, TODAY, 7);
    expect(forecastHourly).toHaveLength(7 * 24);
    expect(forecastHourly[0].datetime).toBe("2026-05-15T00:00");
    expect(forecastHourly.every(h => h.datetime.slice(0, 10) >= TODAY)).toBe(true);
  });

  it("days=16 returns 16-day windows for both forecast and history", () => {
    const { forecastDaily, historyDaily } = sliceWeather(weather, TODAY, 16);
    expect(forecastDaily).toHaveLength(16);
    expect(historyDaily).toHaveLength(16);
  });
});
