import { describe, expect, it } from "vitest";
import { buildSections } from "@/lib/modelSections";
import type { HourlyWeather } from "@/lib/weather";

const h = (datetime: string, model?: string): HourlyWeather => ({
  datetime, temp: 10, feelsLike: 9, dewPoint: 4, humidity: 60,
  precip: 0, precipChance: 20, windSpeed: 3, windGust: 5, model,
});

describe("buildSections", () => {
  it("groups consecutive hours by model", () => {
    const sections = buildSections([
      h("2026-01-01T00:00", "HRRR"),
      h("2026-01-01T01:00", "HRRR"),
      h("2026-01-01T02:00", "NAM"),
    ]);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ model: "HRRR", start: "2026-01-01T00:00", end: "2026-01-01T01:00" });
    expect(sections[1]).toMatchObject({ model: "NAM", start: "2026-01-01T02:00" });
  });

  it("skips hours with no model", () => {
    expect(buildSections([h("2026-01-01T00:00")])).toEqual([]);
  });
});
