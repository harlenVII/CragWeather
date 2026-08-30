import { afterEach, describe, expect, it } from "vitest";
import { localDayAndHour, sliceWeather } from "@/lib/sliceWeather";
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

// Today's hours carry distinct values so partial-day aggregation is observable:
// temp = hour (0…23), precip = 1mm every hour.
const varyingWeather = {
  daily,
  hourly: hourly.map(h =>
    h.datetime.slice(0, 10) === TODAY
      ? { ...h, temp: Number(h.datetime.slice(11, 13)), precip: 1 }
      : h,
  ),
};

describe("sliceWeather partial today", () => {
  it("appends a partial entry for today when nowHour is given", () => {
    const { historyDaily } = sliceWeather(varyingWeather, TODAY, 7, 12);
    expect(historyDaily).toHaveLength(8);
    expect(historyDaily[7].date).toBe(TODAY);
    expect(historyDaily[7].partial).toBe(true);
  });

  it("aggregates only hours up to and including nowHour", () => {
    const { historyDaily } = sliceWeather(varyingWeather, TODAY, 7, 12);
    const todayEntry = historyDaily[7];
    expect(todayEntry.tempMax).toBe(12);
    expect(todayEntry.tempMin).toBe(0);
    expect(todayEntry.precip).toBe(13);
  });

  it("leaves the completed history days untouched", () => {
    const { historyDaily } = sliceWeather(varyingWeather, TODAY, 7, 12);
    const completed = historyDaily.slice(0, 7);
    expect(completed.every(d => d.date < TODAY)).toBe(true);
    expect(completed.every(d => d.partial === undefined)).toBe(true);
    expect(completed[0].date).toBe("2026-05-08");
    expect(completed[6].date).toBe("2026-05-14");
  });

  it("appends no partial entry when nowHour is omitted", () => {
    const { historyDaily } = sliceWeather(varyingWeather, TODAY, 7);
    expect(historyDaily).toHaveLength(7);
    expect(historyDaily.some(d => d.date === TODAY)).toBe(false);
  });

  it("appends no partial entry when today has no hourly data", () => {
    const noToday = {
      daily,
      hourly: hourly.filter(h => h.datetime.slice(0, 10) !== TODAY),
    };
    const { historyDaily } = sliceWeather(noToday, TODAY, 7, 12);
    expect(historyDaily).toHaveLength(7);
  });

  it("carries the contributing model labels onto the partial entry", () => {
    const withModels = {
      daily,
      hourly: varyingWeather.hourly.map(h =>
        h.datetime.slice(0, 10) === TODAY
          ? { ...h, model: Number(h.datetime.slice(11, 13)) < 6 ? "HRRR" : "NAM" }
          : h,
      ),
    };
    const { historyDaily } = sliceWeather(withModels, TODAY, 7, 12);
    expect(historyDaily[7].model).toBe("HRRR & NAM");
  });
});

describe("localDayAndHour", () => {
  const originalTZ = process.env.TZ;
  afterEach(() => { process.env.TZ = originalTZ; });

  it("uses the viewer's local calendar day, not the UTC day", () => {
    process.env.TZ = "America/Los_Angeles";
    // 01:30Z on the 16th is still 18:30 on the 15th in Los Angeles.
    expect(localDayAndHour(new Date("2026-05-16T01:30:00Z"))).toEqual({
      today: "2026-05-15",
      nowHour: 18,
    });
  });

  it("zero-pads month and day", () => {
    process.env.TZ = "UTC";
    expect(localDayAndHour(new Date("2026-01-05T09:00:00Z"))).toEqual({
      today: "2026-01-05",
      nowHour: 9,
    });
  });
});
