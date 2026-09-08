import { describe, expect, it } from "vitest";
import {
  AQI_AXIS_FLOOR,
  AQI_PAD,
  aqiCategory,
  aqiDomain,
  formatAqiCutoff,
  lastCoveredIndex,
  nullRuns,
  visibleBands,
} from "@/lib/aqiBands";

describe("aqiDomain", () => {
  it("holds the axis at the floor for clean air", () => {
    // Measured at Yosemite: us_aqi 17..52. Auto-fitting that range would draw a
    // "Good" day as a full-height line reading as an emergency, and the scale
    // would shift between crags (Yosemite 17-52 vs LA 59-99) and between the
    // 7/10/15-day windows. Same reasoning as MM_AXIS_FLOOR in PrecipPanel.
    expect(aqiDomain([17, 30, 52])).toEqual([0, AQI_AXIS_FLOOR]);
  });

  it("keeps zero as the lower bound", () => {
    // Unlike temperature (an interval scale, where tempDomain floats the min),
    // AQI is a ratio scale: 0 genuinely means "no pollution".
    const [lo] = aqiDomain([60, 80, 99]);
    expect(lo).toBe(0);
  });

  it("extends above the floor for a smoke event, with headroom", () => {
    expect(aqiDomain([40, 250, 60])).toEqual([0, 250 + AQI_PAD]);
  });

  it("rounds a fractional peak up before padding", () => {
    expect(aqiDomain([180.2])).toEqual([0, 181 + AQI_PAD]);
  });

  it("returns the floor for an empty or all-null series", () => {
    expect(aqiDomain([])).toEqual([0, AQI_AXIS_FLOOR]);
    expect(aqiDomain([null, null])).toEqual([0, AQI_AXIS_FLOOR]);
  });

  it("ignores nulls mixed into a real series", () => {
    expect(aqiDomain([120, null, 200, null])).toEqual([0, 200 + AQI_PAD]);
  });
});

describe("aqiCategory", () => {
  it("puts the EPA boundaries on the right side", () => {
    expect(aqiCategory(0).label).toBe("Good");
    expect(aqiCategory(50).label).toBe("Good");
    expect(aqiCategory(51).label).toBe("Moderate");
    expect(aqiCategory(100).label).toBe("Moderate");
    expect(aqiCategory(101).label).toBe("Unhealthy (sensitive)");
    expect(aqiCategory(200).label).toBe("Unhealthy");
    expect(aqiCategory(300).label).toBe("Very unhealthy");
    expect(aqiCategory(301).label).toBe("Hazardous");
  });

  it("clamps anything above the scale to the top band", () => {
    expect(aqiCategory(9999).label).toBe("Hazardous");
  });
});

describe("visibleBands", () => {
  it("renders exactly the two low bands at the floor", () => {
    // A clean crag should be a calm two-tone panel, not a permanent rainbow.
    const bands = visibleBands(AQI_AXIS_FLOOR);
    expect(bands.map(b => b.label)).toEqual(["Good", "Moderate"]);
  });

  it("reveals higher bands as the domain grows", () => {
    const bands = visibleBands(260);
    expect(bands.map(b => b.label)).toEqual([
      "Good", "Moderate", "Unhealthy (sensitive)", "Unhealthy", "Very unhealthy",
    ]);
  });

  it("clamps the topmost band to the domain so it cannot overshoot the axis", () => {
    const bands = visibleBands(260);
    expect(bands[bands.length - 1].max).toBe(260);
  });

  it("is contiguous, leaving no unpainted gap between bands", () => {
    const bands = visibleBands(260);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].min).toBe(bands[i - 1].max);
    }
  });
});

describe("lastCoveredIndex", () => {
  it("finds the last non-null slot before the trailing tail", () => {
    // The measured CAMS shape: a contiguous prefix then a clean null tail.
    expect(lastCoveredIndex([10, 20, 30, null, null])).toBe(2);
  });

  it("returns the final index when there is no tail", () => {
    expect(lastCoveredIndex([10, 20, 30])).toBe(2);
  });

  it("returns -1 when nothing is covered", () => {
    expect(lastCoveredIndex([])).toBe(-1);
    expect(lastCoveredIndex([null, null])).toBe(-1);
  });
});

describe("nullRuns", () => {
  it("finds a trailing run", () => {
    expect(nullRuns([10, 20, 30, null, null])).toEqual([{ start: 3, end: 4 }]);
  });

  it("finds a leading run", () => {
    // The shape the joined series takes when the crag's calendar date is ahead
    // of the viewer's: forecastHourly opens with hours AQ never covered.
    expect(nullRuns([null, null, 10, 20, 30])).toEqual([{ start: 0, end: 1 }]);
  });

  it("finds a leading run and a trailing run together", () => {
    expect(nullRuns([null, 10, 20, null, null])).toEqual([
      { start: 0, end: 0 },
      { start: 3, end: 4 },
    ]);
  });

  it("finds an interior run with real data on both sides", () => {
    expect(nullRuns([10, null, null, 20, 30])).toEqual([{ start: 1, end: 2 }]);
  });

  it("treats an all-null series as one run spanning the whole array", () => {
    expect(nullRuns([null, null, null])).toEqual([{ start: 0, end: 2 }]);
  });

  it("returns no runs when there are no nulls", () => {
    expect(nullRuns([10, 20, 30])).toEqual([]);
  });

  it("returns no runs for an empty array", () => {
    expect(nullRuns([])).toEqual([]);
  });
});

describe("formatAqiCutoff", () => {
  it("formats a local timestamp without constructing a Date", () => {
    // Open-Meteo timestamps are crag-local wall clock. new Date("...") would
    // reinterpret them in the viewer's zone — the trap localDayAndHour exists
    // to avoid — so this reads the string positionally.
    expect(formatAqiCutoff("2026-09-12T06:00")).toBe("12 Sep, 06:00");
  });

  it("does not zero-pad the day", () => {
    expect(formatAqiCutoff("2026-01-05T23:00")).toBe("5 Jan, 23:00");
  });
});
