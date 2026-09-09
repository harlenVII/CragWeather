import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { aggregateDaily, fetchWeather, type HourlyWeather } from "@/lib/weather";

const fixture = JSON.parse(
  readFileSync(join(__dirname, "..", "fixtures", "open-meteo.json"), "utf8"),
);

/** Deep-clone the fixture so a test can mutate it without leaking to the next. */
function clone() {
  return JSON.parse(JSON.stringify(fixture));
}

describe("fetchWeather", () => {
  it("normalizes the Open-Meteo response", async () => {
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

  // The continent branch is gone: Open-Meteo's own `best_match` already walks
  // high-resolution → regional → global per location (measured: bit-for-bit
  // `gfs_seamless` in CONUS, UKMO 2km in the UK, ICON-D2 in the Alps), so there
  // is one request shape everywhere.
  it("never sends a models param, and asks only for sun times as daily", async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
        const url = new URL(request.url);
        seen.push(url.searchParams.get("models"));
        expect(url.searchParams.get("daily")).toBe("sunrise,sunset");
        return HttpResponse.json(fixture);
      }),
    );

    await fetchWeather(37.73, -119.64);  // Yosemite, CONUS
    await fetchWeather(45.92, 6.87);     // Chamonix, France
    await fetchWeather(21.31, -157.65);  // Hawaii — outside every NCEP CONUS nest
    await fetchWeather(-33.86, 151.21);  // Sydney

    expect(seen).toEqual([null, null, null, null]);
  });

  // Regression: requesting a multi-model list made Open-Meteo drop the column
  // prefixes wherever fewer than two models had data (Hawaii, Alaska, Yukon,
  // southern Mexico, the Caribbean, Central America), and the extraction then
  // indexed `undefined` and threw a TypeError — a 500 on the route page.
  // With no models param the flat response is the only shape there is.
  it("parses a flat response at coordinates that used to throw", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(fixture)),
    );
    for (const [lat, lng] of [[21.31, -157.65], [61.79, -149.2], [17.06, -96.72], [22.61, -83.71]]) {
      const w = await fetchWeather(lat, lng);
      expect(w.hourly.length).toBeGreaterThan(0);
      expect(w.daily.length).toBeGreaterThan(0);
    }
  });

  it("includes windSpeed and windGust in hourly", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(fixture)),
    );
    const w = await fetchWeather(45.92, 6.87);
    expect(w.hourly[0].windSpeed).toBe(3);
    expect(w.hourly[0].windGust).toBe(6);
  });

  it("requests wind in m/s rather than Open-Meteo's default km/h", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
        expect(new URL(request.url).searchParams.get("wind_speed_unit")).toBe("ms");
        return HttpResponse.json(fixture);
      }),
    );
    await fetchWeather(45.92, 6.87);
  });

  it("includes humidity, feels-like and dew point", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
        const hourly = new URL(request.url).searchParams.get("hourly") ?? "";
        expect(hourly).toContain("relative_humidity_2m");
        expect(hourly).toContain("apparent_temperature");
        expect(hourly).toContain("dew_point_2m");
        return HttpResponse.json(fixture);
      }),
    );
    const w = await fetchWeather(45.92, 6.87);
    expect(typeof w.hourly[0].humidity).toBe("number");
    expect(typeof w.hourly[0].feelsLike).toBe("number");
    expect(typeof w.hourly[0].dewPoint).toBe("number");
  });

  it("includes precipChance", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
        expect(new URL(request.url).searchParams.get("hourly"))
          .toContain("precipitation_probability");
        return HttpResponse.json(fixture);
      }),
    );
    const w = await fetchWeather(45.92, 6.87);
    expect(w.hourly[0].precipChance).toBe(25);
  });

  it("keeps a real 0% chance instead of treating it as a gap", async () => {
    // `?? null`, not `|| null` — a genuine 0 must survive as 0 rather than
    // becoming an absence the chance line breaks across.
    const f = clone();
    f.hourly.precipitation_probability[0] = 0;
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(f)),
    );
    const w = await fetchWeather(45.92, 6.87);
    expect(w.hourly[0].precipChance).toBe(0);
  });

  it("carries a null precipChance through rather than defaulting it to 0", async () => {
    // Probability runs out before temperature does — a trailing run of null
    // hours at the end of the window. A rendered "0%" there would be a claim
    // rather than an absence.
    const f = clone();
    f.hourly.precipitation_probability[0] = null;
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(f)),
    );
    const w = await fetchWeather(45.92, 6.87);
    expect(w.hourly[0].precipChance).toBeNull();
  });

  // Regression: `best_match` ends with a short null tail (measured: 3 hours at
  // Céüse, 2 at Kalymnos on a 768-slot window). Mapping every slot blindly put
  // `temp: null` into hourly and a null tempMax on the final daily entry.
  it("skips hourly slots whose temperature is null", async () => {
    const f = clone();
    const n = f.hourly.time.length;
    for (const i of [n - 3, n - 2, n - 1]) f.hourly.temperature_2m[i] = null;
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(f)),
    );
    const w = await fetchWeather(45.92, 6.87);
    expect(w.hourly).toHaveLength(14 * 24 - 3);
    expect(w.hourly.every(h => typeof h.temp === "number")).toBe(true);
    expect(w.daily.every(d => Number.isFinite(d.tempMax) && Number.isFinite(d.tempMin))).toBe(true);
  });

  it("drops a day entirely when every one of its hours is null", async () => {
    const f = clone();
    const n = f.hourly.time.length;
    for (let i = n - 24; i < n; i++) f.hourly.temperature_2m[i] = null;
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(f)),
    );
    const w = await fetchWeather(45.92, 6.87);
    expect(w.daily).toHaveLength(13);
    expect(w.daily.map(d => d.date)).not.toContain(fixture.daily.time[13]);
  });

  it("attaches sunrise and sunset to each day", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(fixture)),
    );
    const w = await fetchWeather(45.92, 6.87);
    expect(w.daily[0].sunrise).toBe(fixture.daily.sunrise[0]);
    expect(w.daily[0].sunset).toBe(fixture.daily.sunset[0]);
    expect(w.daily.at(-1)!.sunrise).toBe(fixture.daily.sunrise[13]);
  });

  it("throws on non-200 response", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () =>
        new HttpResponse(null, { status: 503 }),
      ),
    );
    await expect(fetchWeather(0, 0)).rejects.toThrow(/503/);
  });
});

/** Minimal hourly entries at 2026-05-{day}T{hour}:00, one per supplied temp. */
function makeHourly(temps: number[], precips: number[] = []): HourlyWeather[] {
  return temps.map((temp, i) => ({
    datetime: `2026-05-${String(Math.floor(i / 24) + 1).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:00`,
    temp,
    feelsLike: temp,
    dewPoint: 0,
    humidity: 0,
    precip: precips[i] ?? 0,
    precipChance: null,
    windSpeed: 0,
    windGust: 0,
  }));
}

describe("aggregateDaily", () => {
  // Daily values are derived from the hourly entries rather than read from
  // Open-Meteo's own daily block. The two are numerically identical under
  // `best_match` (measured: 0.000 difference over 94 days at 3 crags), but
  // `partialToday` in sliceWeather derives today's history entry from hourly
  // with these same max/min/sum rules — deriving here keeps one rule for both.
  it("derives tempMax, tempMin and precip per date", () => {
    const daily = aggregateDaily(makeHourly([10, 20], [0.5, 0.5]));
    expect(daily).toHaveLength(1);
    expect(daily[0]).toMatchObject({ date: "2026-05-01", tempMax: 20, tempMin: 10 });
    expect(daily[0].precip).toBeCloseTo(1.0);
  });

  it("splits entries into one day per calendar date", () => {
    const daily = aggregateDaily(makeHourly(Array.from({ length: 48 }, (_, i) => i)));
    expect(daily.map(d => d.date)).toEqual(["2026-05-01", "2026-05-02"]);
    expect(daily[0].tempMax).toBe(23);
    expect(daily[1].tempMin).toBe(24);
  });

  it("joins sun times by date, not by position", () => {
    const daily = aggregateDaily(makeHourly([10, 20, 30, 40].flatMap(t => Array(24).fill(t))), {
      time: ["2026-05-02", "2026-05-01", "2026-05-03", "2026-05-04"],
      sunrise: ["2026-05-02T06:02", "2026-05-01T06:01", "2026-05-03T06:03", "2026-05-04T06:04"],
      sunset: ["2026-05-02T20:02", "2026-05-01T20:01", "2026-05-03T20:03", "2026-05-04T20:04"],
    });
    expect(daily[0].sunrise).toBe("2026-05-01T06:01");
    expect(daily[1].sunrise).toBe("2026-05-02T06:02");
  });

  it("leaves sun times undefined for a date the sun block does not cover", () => {
    const daily = aggregateDaily(makeHourly([10]), { time: [], sunrise: [], sunset: [] });
    expect(daily[0].sunrise).toBeUndefined();
    expect(daily[0].sunset).toBeUndefined();
  });

  it("returns no days for no hours", () => {
    expect(aggregateDaily([])).toEqual([]);
  });
});
