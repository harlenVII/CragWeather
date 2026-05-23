import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { fetchWeather, isNorthAmerica, stitchModels } from "@/lib/weather";

const fixture = JSON.parse(
  readFileSync(join(__dirname, "..", "fixtures", "open-meteo.json"), "utf8"),
);

describe("fetchWeather", () => {
  it("normalizes the Open-Meteo response for a non-NA route", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("latitude")).toBe("45.92");
        expect(url.searchParams.get("longitude")).toBe("6.87");
        expect(url.searchParams.get("past_days")).toBe("7");
        expect(url.searchParams.get("forecast_days")).toBe("7");
        return HttpResponse.json(fixture);
      }),
    );

    const w = await fetchWeather(45.92, 6.87); // Chamonix, France
    expect(w.daily).toHaveLength(14);
    expect(w.hourly).toHaveLength(14 * 24);
    expect(w.daily[0]).toMatchObject({
      date: expect.any(String),
      tempMax: expect.any(Number),
      tempMin: expect.any(Number),
      precip: expect.any(Number),
    });
    expect(w.hourly[0]).toMatchObject({
      datetime: expect.any(String),
      temp: expect.any(Number),
      precip: expect.any(Number),
    });
  });

  it("throws on non-200 response", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () =>
        new HttpResponse(null, { status: 503 }),
      ),
    );
    await expect(fetchWeather(0, 0)).rejects.toThrow(/503/);
  });

  // Multi-model fixture: array of 4 OmHourlyResponse objects (no daily field).
  // The 336-slot window = 7 past days (indices 0-167) + 7 future days (indices 168-335).
  // ERA5:  past slots have data, future is null.
  // HRRR:  past null, future slots 168-215 (~48h) have data, rest null.
  // NAM:   past null, future slots 168-263 (~96h) have data, rest null.
  // GFS:   all 336 slots have data.
  const multiFixture = [
    {
      hourly: {
        time: fixture.hourly.time,
        temperature_2m: Array.from({ length: 14 * 24 }, (_, i) => i < 168 ? 10 : null),
        precipitation:  Array.from({ length: 14 * 24 }, (_, i) => i < 168 ? 0  : null),
      },
    },
    {
      hourly: {
        time: fixture.hourly.time,
        temperature_2m: Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 216 ? 15 : null),
        precipitation:  Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 216 ? 0  : null),
      },
    },
    {
      hourly: {
        time: fixture.hourly.time,
        temperature_2m: Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 264 ? 13 : null),
        precipitation:  Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 264 ? 0  : null),
      },
    },
    {
      hourly: fixture.hourly,
    },
  ];

  it("sends models param, omits daily param, and stitches hourly for a CONUS route", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("models")).toBe("era5_seamless,hrrr,nam_conus,gfs_global");
        expect(url.searchParams.get("daily")).toBeNull();
        expect(url.searchParams.get("latitude")).toBe("37.73");
        return HttpResponse.json(multiFixture);
      }),
    );
    const w = await fetchWeather(37.73, -119.64);
    expect(w.daily).toHaveLength(14);
    // Days 0-6 (hourly indices 0-167): past → ERA5
    expect(w.daily[0].model).toBe("ERA5");
    // Days 7-8 (hourly indices 168-215): HRRR forecast window
    expect(w.daily[7].model).toBe("HRRR");
    // Days 9-10 (hourly indices 216-263): NAM forecast window
    expect(w.daily[9].model).toBe("NAM");
    // Days 11-13 (hourly indices 264-335): GFS
    expect(w.daily[11].model).toBe("GFS");
    expect(w.hourly[0].model).toBe("ERA5");
    expect(w.hourly[168].model).toBe("HRRR");
    expect(w.hourly[216].model).toBe("NAM");
    expect(w.hourly[264].model).toBe("GFS");
  });

  it("sends models param for a Canadian route (graceful ERA5→GFS degradation)", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("models")).toBe("era5_seamless,hrrr,nam_conus,gfs_global");
        return HttpResponse.json(multiFixture);
      }),
    );
    const w = await fetchWeather(49.7, -123.15); // Squamish, BC
    expect(w.daily[0]).toBeDefined();
  });

  it("does NOT set models param for a non-North-American route", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("models")).toBeNull();
        expect(url.searchParams.get("daily")).toBe("temperature_2m_max,temperature_2m_min,precipitation_sum");
        return HttpResponse.json(fixture);
      }),
    );
    const w = await fetchWeather(45.92, 6.87); // Chamonix, France
    expect(w.daily[0].model).toBeUndefined();
  });
});

// Helper: build a minimal OmHourlyResponse for testing stitchModels.
// Index i maps to 2026-05-01T{HH}:00 where HH = i % 24, day = floor(i/24)+1.
function makeOm(temps: (number | null)[], precips: (number | null)[]) {
  return {
    hourly: {
      time: temps.map((_, i) => {
        const day = String(Math.floor(i / 24) + 1).padStart(2, "0");
        const hr  = String(i % 24).padStart(2, "0");
        return `2026-05-${day}T${hr}:00`;
      }),
      temperature_2m: temps,
      precipitation: precips,
    },
  };
}

describe("stitchModels", () => {
  it("hourly: picks HRRR when it has data", () => {
    const result = stitchModels(
      [makeOm([20], [0]), makeOm([18], [0]), makeOm([16], [0])],
      ["HRRR", "NAM", "GFS"],
    );
    expect(result.hourly[0].temp).toBe(20);
    expect(result.hourly[0].model).toBe("HRRR");
  });

  it("hourly: falls through to NAM when HRRR slot is null", () => {
    const result = stitchModels(
      [makeOm([null], [null]), makeOm([18], [0]), makeOm([16], [0])],
      ["HRRR", "NAM", "GFS"],
    );
    expect(result.hourly[0].temp).toBe(18);
    expect(result.hourly[0].model).toBe("NAM");
  });

  it("hourly: falls through to GFS when HRRR and NAM are both null", () => {
    const result = stitchModels(
      [makeOm([null], [null]), makeOm([null], [null]), makeOm([16], [0.5])],
      ["HRRR", "NAM", "GFS"],
    );
    expect(result.hourly[0].temp).toBe(16);
    expect(result.hourly[0].model).toBe("GFS");
  });

  it("hourly: omits slots where all models are null", () => {
    const result = stitchModels(
      [makeOm([null, 20], [null, 0]), makeOm([null, 18], [null, 0]), makeOm([null, 16], [null, 0])],
      ["HRRR", "NAM", "GFS"],
    );
    expect(result.hourly).toHaveLength(1);
    expect(result.hourly[0].model).toBe("HRRR");
  });

  it("daily: derives tempMax, tempMin, precip from stitched hourly entries", () => {
    // 2 hourly entries in the same day (2026-05-01T00 and T01)
    const result = stitchModels(
      [makeOm([10, 20], [0.5, 0.5]), makeOm([8, 18], [0, 0]), makeOm([6, 16], [0, 0])],
      ["HRRR", "NAM", "GFS"],
    );
    expect(result.daily).toHaveLength(1);
    expect(result.daily[0].date).toBe("2026-05-01");
    expect(result.daily[0].tempMax).toBe(20);
    expect(result.daily[0].tempMin).toBe(10);
    expect(result.daily[0].precip).toBeCloseTo(1.0);
    expect(result.daily[0].model).toBe("HRRR");
  });

  it("daily: badge shows majority model when a day straddles the HRRR cutoff", () => {
    // 4 hourly entries in 2026-05-01: slot 0 from HRRR, slots 1-3 from NAM
    const result = stitchModels(
      [makeOm([20, null, null, null], [0, null, null, null]), makeOm([null, 18, 18, 18], [null, 0, 0, 0]), makeOm([16, 16, 16, 16], [0, 0, 0, 0])],
      ["HRRR", "NAM", "GFS"],
    );
    expect(result.daily[0].model).toBe("NAM"); // 3 NAM hours vs 1 HRRR hour
  });
});

describe("isNorthAmerica", () => {
  it("returns true for Yosemite, CA (CONUS)", () => {
    expect(isNorthAmerica(37.73, -119.64)).toBe(true);
  });
  it("returns true for Squamish, BC (Canada)", () => {
    expect(isNorthAmerica(49.7, -123.15)).toBe(true);
  });
  it("returns true for El Potrero Chico, Mexico", () => {
    expect(isNorthAmerica(26.87, -100.47)).toBe(true);
  });
  it("returns false for Chamonix, France", () => {
    expect(isNorthAmerica(45.92, 6.87)).toBe(false);
  });
  it("returns false for Kalymnos, Greece", () => {
    expect(isNorthAmerica(36.95, 26.98)).toBe(false);
  });
});
