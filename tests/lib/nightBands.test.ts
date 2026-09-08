import { describe, expect, it } from "vitest";
import { getNightBands } from "@/lib/nightBands";

const day = (date: string, sunrise: string, sunset: string) => ({
  date,
  tempMax: 20,
  tempMin: 10,
  precip: 0,
  sunrise: `${date}T${sunrise}`,
  sunset: `${date}T${sunset}`,
});

describe("getNightBands", () => {
  it("spans midnight from one day's sunset to the next day's sunrise", () => {
    const bands = getNightBands(
      [day("2026-09-08", "06:00", "19:00"), day("2026-09-09", "06:00", "19:00")],
      "2026-09-08T00:00",
      "2026-09-09T23:00",
    );
    expect(bands).toContainEqual({ start: "2026-09-08T19:00", end: "2026-09-09T06:00" });
  });

  it("clips the leading band to the first visible hour", () => {
    const bands = getNightBands([day("2026-09-08", "06:00", "19:00")], "2026-09-08T03:00", "2026-09-08T23:00");
    expect(bands[0]).toEqual({ start: "2026-09-08T03:00", end: "2026-09-08T06:00" });
  });

  it("clips the trailing band to the last visible hour", () => {
    const bands = getNightBands([day("2026-09-08", "06:00", "19:00")], "2026-09-08T00:00", "2026-09-08T21:00");
    expect(bands.at(-1)).toEqual({ start: "2026-09-08T19:00", end: "2026-09-08T21:00" });
  });

  it("snaps sunrise and sunset to the nearest whole hour", () => {
    // Recharts' x-axis is a category scale keyed on the hourly datetime strings,
    // so a boundary that is not itself a data point is dropped entirely.
    const bands = getNightBands([day("2026-09-08", "06:34", "19:17")], "2026-09-08T00:00", "2026-09-08T23:00");
    expect(bands[0].end).toBe("2026-09-08T07:00");
    expect(bands.at(-1)!.start).toBe("2026-09-08T19:00");
  });

  it("rolls over the date when snapping up from the last hour of a day", () => {
    const bands = getNightBands([day("2026-09-30", "06:00", "23:45")], "2026-09-30T00:00", "2026-10-01T02:00");
    expect(bands.at(-1)!.start).toBe("2026-10-01T00:00");
  });

  it("skips days with no sunrise or sunset, as returned above the arctic circle", () => {
    const polar = { date: "2026-06-21", tempMax: 5, tempMin: 1, precip: 0 };
    expect(getNightBands([polar], "2026-06-21T00:00", "2026-06-21T23:00")).toEqual([]);
  });

  it("emits nothing when the day list is empty", () => {
    expect(getNightBands([], "2026-09-08T00:00", "2026-09-08T23:00")).toEqual([]);
  });
});
