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
        expect(url.searchParams.get("past_days")).toBe("16");
        expect(url.searchParams.get("forecast_days")).toBe("16");
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

  it("includes windSpeed and windGust in hourly for a non-NA route", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () =>
        HttpResponse.json(fixture),
      ),
    );
    const w = await fetchWeather(45.92, 6.87);
    expect(typeof w.hourly[0].windSpeed).toBe("number");
    expect(typeof w.hourly[0].windGust).toBe("number");
    expect(w.hourly[0].windSpeed).toBe(3);
    expect(w.hourly[0].windGust).toBe(6);
  });

  it("throws on non-200 response", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () =>
        new HttpResponse(null, { status: 503 }),
      ),
    );
    await expect(fetchWeather(0, 0)).rejects.toThrow(/503/);
  });

  // Multi-model fixture: single object with per-model prefixed arrays (real Open-Meteo format).
  const dailyDates: string[] = [...new Set(
    (fixture.hourly.time as string[]).map(t => t.slice(0, 10)),
  )];

  // The fixture uses a 336-slot (14-day) window to test stitching logic.
  // The real API now requests past_days=16 & forecast_days=16 (768 slots),
  // but this mock is intentionally smaller — stitching behavior is slot-count-independent.
  // ncep_hrrr_conus: future slots 168-215 (~48h) have data, rest null.
  // ncep_nam_conus:  future slots 168-263 (~96h) have data, rest null.
  // gfs_seamless:    all 336 slots have data.
  const multiFixture = {
    hourly: {
      time: fixture.hourly.time,
      temperature_2m_ncep_hrrr_conus: Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 216 ? 15 : null),
      precipitation_ncep_hrrr_conus:  Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 216 ? 0  : null),
      wind_speed_10m_ncep_hrrr_conus: Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 216 ? 5 : null),
      wind_gusts_10m_ncep_hrrr_conus: Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 216 ? 8 : null),
      temperature_2m_ncep_nam_conus:  Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 264 ? 13 : null),
      precipitation_ncep_nam_conus:   Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 264 ? 0  : null),
      wind_speed_10m_ncep_nam_conus:  Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 264 ? 4 : null),
      wind_gusts_10m_ncep_nam_conus:  Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 264 ? 7 : null),
      temperature_2m_gfs_seamless:    fixture.hourly.temperature_2m,
      precipitation_gfs_seamless:     fixture.hourly.precipitation,
      wind_speed_10m_gfs_seamless:    Array.from({ length: 14 * 24 }, () => 3),
      wind_gusts_10m_gfs_seamless:    Array.from({ length: 14 * 24 }, () => 5),
      relative_humidity_2m_ncep_hrrr_conus: Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 216 ? 40 : null),
      apparent_temperature_ncep_hrrr_conus: Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 216 ? 13 : null),
      dew_point_2m_ncep_hrrr_conus:         Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 216 ? 2  : null),
      relative_humidity_2m_ncep_nam_conus:  Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 264 ? 55 : null),
      apparent_temperature_ncep_nam_conus:  Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 264 ? 11 : null),
      dew_point_2m_ncep_nam_conus:          Array.from({ length: 14 * 24 }, (_, i) => i >= 168 && i < 264 ? 4  : null),
      relative_humidity_2m_gfs_seamless:    Array.from({ length: 14 * 24 }, () => 70),
      apparent_temperature_gfs_seamless:    Array.from({ length: 14 * 24 }, () => 9),
      dew_point_2m_gfs_seamless:            Array.from({ length: 14 * 24 }, () => 6),
      precipitation_probability_ncep_hrrr_conus: Array.from({ length: 14 * 24 }, () => 11),
      precipitation_probability_ncep_nam_conus:  Array.from({ length: 14 * 24 }, () => null),
      precipitation_probability_gfs_seamless:    Array.from({ length: 14 * 24 }, () => 42),
    },
    // Sunrise/sunset comes back prefixed per model like everything else, but it
    // is astronomy, not forecast: the real API populates all three columns
    // identically across the whole window, with no null tail at HRRR's horizon.
    // The HRRR column here is deliberately given a different time so the tests
    // can prove the seamless column is the one being read.
    daily: {
      time: dailyDates,
      sunrise_ncep_hrrr_conus: dailyDates.map((d: string) => `${d}T09:09`),
      sunset_ncep_hrrr_conus:  dailyDates.map((d: string) => `${d}T21:09`),
      sunrise_ncep_nam_conus:  dailyDates.map((d: string) => `${d}T08:08`),
      sunset_ncep_nam_conus:   dailyDates.map((d: string) => `${d}T20:08`),
      sunrise_gfs_seamless:    dailyDates.map((d: string) => `${d}T06:34`),
      sunset_gfs_seamless:     dailyDates.map((d: string) => `${d}T19:17`),
    },
  };

  it("sends models param, requests only sun times as daily, and stitches hourly for a CONUS route", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("models")).toBe("ncep_hrrr_conus,ncep_nam_conus,gfs_seamless");
        expect(url.searchParams.get("daily")).toBe("sunrise,sunset");
        expect(url.searchParams.get("latitude")).toBe("37.73");
        return HttpResponse.json(multiFixture);
      }),
    );
    const w = await fetchWeather(37.73, -119.64);
    expect(w.daily).toHaveLength(14);
    // Days 0-6 (hourly indices 0-167): past → GFS (HRRR/NAM null for past in fixture)
    expect(w.daily[0].model).toBe("GFS");
    // Days 7-8 (hourly indices 168-215): HRRR forecast window
    expect(w.daily[7].model).toBe("HRRR");
    // Days 9-10 (hourly indices 216-263): NAM forecast window
    expect(w.daily[9].model).toBe("NAM");
    // Days 11-13 (hourly indices 264-335): GFS
    expect(w.daily[11].model).toBe("GFS");
    expect(w.hourly[0].model).toBe("GFS");
    expect(w.hourly[168].model).toBe("HRRR");
    expect(w.hourly[216].model).toBe("NAM");
    expect(w.hourly[264].model).toBe("GFS");
  });

  it("sends models param for a Canadian route (graceful ERA5→GFS degradation)", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("models")).toBe("ncep_hrrr_conus,ncep_nam_conus,gfs_seamless");
        return HttpResponse.json(multiFixture);
      }),
    );
    const w = await fetchWeather(49.7, -123.15); // Squamish, BC
    expect(w.daily[0]).toBeDefined();
  });

  it("includes windSpeed and windGust in hourly for an NA route", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () =>
        HttpResponse.json(multiFixture),
      ),
    );
    const w = await fetchWeather(37.73, -119.64);
    expect(typeof w.hourly[0].windSpeed).toBe("number");
    // slot 168 is first HRRR slot: speed=5, gust=8
    expect(w.hourly[168].windSpeed).toBe(5);
    expect(w.hourly[168].windGust).toBe(8);
  });

  it("carries humidity, feels-like and dew point from the winning model", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("hourly")).toContain("relative_humidity_2m");
        expect(url.searchParams.get("hourly")).toContain("apparent_temperature");
        expect(url.searchParams.get("hourly")).toContain("dew_point_2m");
        return HttpResponse.json(multiFixture);
      }),
    );
    const w = await fetchWeather(37.73, -119.64);
    // slot 168 = first HRRR slot
    expect(w.hourly[168]).toMatchObject({ model: "HRRR", humidity: 40, feelsLike: 13, dewPoint: 2 });
    // slot 216 = first NAM slot
    expect(w.hourly[216]).toMatchObject({ model: "NAM", humidity: 55, feelsLike: 11, dewPoint: 4 });
    // slot 264 = GFS
    expect(w.hourly[264]).toMatchObject({ model: "GFS", humidity: 70, feelsLike: 9, dewPoint: 6 });
  });

  it("includes humidity, feels-like and dew point for a non-NA route", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(fixture)),
    );
    const w = await fetchWeather(45.92, 6.87);
    expect(typeof w.hourly[0].humidity).toBe("number");
    expect(typeof w.hourly[0].feelsLike).toBe("number");
    expect(typeof w.hourly[0].dewPoint).toBe("number");
  });

  it("sources precipChance from gfs_seamless regardless of the winning model", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("hourly")).toContain("precipitation_probability");
        return HttpResponse.json(multiFixture);
      }),
    );
    const w = await fetchWeather(37.73, -119.64);
    // Every hour takes the seamless value (42), never HRRR's (11), whichever model wins temp.
    expect(w.hourly[168].model).toBe("HRRR");
    expect(w.hourly[168].precipChance).toBe(42);
    expect(w.hourly[264].model).toBe("GFS");
    expect(w.hourly[264].precipChance).toBe(42);
  });

  it("keeps a precipChance through the NAM band, where NAM supplies none", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(multiFixture)),
    );
    const w = await fetchWeather(37.73, -119.64);
    // slot 216 is NAM-only: NAM wins temp/wind but has no probability of its own.
    expect(w.hourly[216].model).toBe("NAM");
    expect(w.hourly[216].temp).toBe(13);
    expect(w.hourly[216].precipChance).toBe(42);
  });

  it("includes precipChance for a non-NA route", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(fixture)),
    );
    const w = await fetchWeather(45.92, 6.87);
    expect(w.hourly[0].precipChance).toBe(25);
  });

  it("does NOT set models param for a non-North-American route", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("models")).toBeNull();
        expect(url.searchParams.get("daily"))
          .toBe("temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset");
        return HttpResponse.json(fixture);
      }),
    );
    const w = await fetchWeather(45.92, 6.87); // Chamonix, France
    expect(w.daily[0].model).toBeUndefined();
  });
  it("attaches sunrise and sunset to each day for an NA route", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(multiFixture)),
    );
    const w = await fetchWeather(37.73, -119.64);
    expect(w.daily[0].sunrise).toBe(`${w.daily[0].date}T06:34`);
    expect(w.daily[0].sunset).toBe(`${w.daily[0].date}T19:17`);
  });

  it("sources sun times from gfs_seamless regardless of the winning model", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(multiFixture)),
    );
    const w = await fetchWeather(37.73, -119.64);
    // Day 7 is HRRR's window for every weather variable; the sun times must
    // still come from the seamless column, not HRRR's 09:09.
    expect(w.daily[7].model).toBe("HRRR");
    expect(w.daily[7].sunrise).toBe(`${w.daily[7].date}T06:34`);
  });

  it("keeps sun times past HRRR's and NAM's coverage windows", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(multiFixture)),
    );
    const w = await fetchWeather(37.73, -119.64);
    const last = w.daily[w.daily.length - 1];
    expect(last.model).toBe("GFS");
    expect(last.sunrise).toBe(`${last.date}T06:34`);
    expect(last.sunset).toBe(`${last.date}T19:17`);
  });

  it("includes sunrise and sunset for a non-NA route", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
        expect(new URL(request.url).searchParams.get("daily"))
          .toBe("temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset");
        return HttpResponse.json(fixture);
      }),
    );
    const w = await fetchWeather(45.92, 6.87);
    expect(w.daily[0].sunrise).toBe(fixture.daily.sunrise[0]);
    expect(w.daily[0].sunset).toBe(fixture.daily.sunset[0]);
  });

});

// Helper: build a minimal OmHourlyResponse for testing stitchModels.
// Index i maps to 2026-05-01T{HH}:00 where HH = i % 24, day = floor(i/24)+1.
function makeOm(
  temps: (number | null)[],
  precips: (number | null)[],
  windSpeeds?: (number | null)[],
  windGusts?: (number | null)[],
) {
  return {
    hourly: {
      time: temps.map((_, i) => {
        const day = String(Math.floor(i / 24) + 1).padStart(2, "0");
        const hr  = String(i % 24).padStart(2, "0");
        return `2026-05-${day}T${hr}:00`;
      }),
      temperature_2m: temps,
      apparent_temperature: temps.map(() => null),
      dew_point_2m: temps.map(() => null),
      relative_humidity_2m: temps.map(() => null),
      precipitation: precips,
      wind_speed_10m: windSpeeds ?? temps.map(() => null),
      wind_gusts_10m: windGusts ?? temps.map(() => null),
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

  it("daily: badge combines all models that contributed hours to the day", () => {
    // 4 hourly entries in 2026-05-01: slot 0 from HRRR, slots 1-3 from NAM
    const result = stitchModels(
      [makeOm([20, null, null, null], [0, null, null, null]), makeOm([null, 18, 18, 18], [null, 0, 0, 0]), makeOm([16, 16, 16, 16], [0, 0, 0, 0])],
      ["HRRR", "NAM", "GFS"],
    );
    expect(result.daily[0].model).toBe("HRRR & NAM");
  });

  it("hourly: carries windSpeed and windGust from the winning model", () => {
    const result = stitchModels(
      [
        makeOm([null], [null], [null], [null]),
        makeOm([18], [0], [25], [35]),
        makeOm([16], [0], [20], [30]),
      ],
      ["HRRR", "NAM", "GFS"],
    );
    expect(result.hourly[0].windSpeed).toBe(25);
    expect(result.hourly[0].windGust).toBe(35);
  });

  it("yields null precipChance when no probability array is supplied", () => {
    const result = stitchModels(
      [makeOm([20], [0]), makeOm([18], [0]), makeOm([16], [0])],
      ["HRRR", "NAM", "GFS"],
    );
    expect(result.hourly[0].precipChance).toBeNull();
  });

  it("reads precipChance positionally, not from the winning model", () => {
    const result = stitchModels(
      [makeOm([null, 20], [0, 0]), makeOm([18, 18], [0, 0]), makeOm([16, 16], [0, 0])],
      ["HRRR", "NAM", "GFS"],
      [30, 70],
    );
    expect(result.hourly[0].model).toBe("NAM");
    expect(result.hourly[0].precipChance).toBe(30);
    expect(result.hourly[1].model).toBe("HRRR");
    expect(result.hourly[1].precipChance).toBe(70);
  });

  it("keeps a real 0% chance instead of treating it as a gap", () => {
    // precipChance uses `?? null`, not `|| null` — a genuine 0 must survive as 0.
    // `|| null` would silently convert it to null (a falsy 0), which toBe(0) below
    // would catch (a null value fails toBe(0)) but a truthiness check would not.
    const result = stitchModels(
      [makeOm([20], [0]), makeOm([18], [0]), makeOm([16], [0])],
      ["HRRR", "NAM", "GFS"],
      [0],
    );
    expect(result.hourly[0].precipChance).toBe(0);
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
