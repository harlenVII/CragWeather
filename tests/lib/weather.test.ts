import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { fetchWeather, isNorthAmerica } from "@/lib/weather";

const fixture = JSON.parse(
  readFileSync(join(__dirname, "..", "fixtures", "open-meteo.json"), "utf8"),
);

describe("fetchWeather", () => {
  it("normalizes the Open-Meteo response", async () => {
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("latitude")).toBe("37.73");
        expect(url.searchParams.get("longitude")).toBe("-119.64");
        expect(url.searchParams.get("past_days")).toBe("7");
        expect(url.searchParams.get("forecast_days")).toBe("7");
        return HttpResponse.json(fixture);
      }),
    );

    const w = await fetchWeather(37.73, -119.64);
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
