import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { fetchAirQuality } from "@/lib/airQuality";

const ENDPOINT = "https://air-quality-api.open-meteo.com/v1/air-quality";

// Shaped like the real response: a contiguous prefix of values then a clean
// null tail, which is what CAMS actually returns (~4.3-5.0 days of forecast
// against a requested 7).
const fixture = {
  hourly: {
    time: ["2026-09-08T00:00", "2026-09-08T01:00", "2026-09-08T02:00", "2026-09-08T03:00"],
    us_aqi: [42, 47, null, null],
  },
};

describe("fetchAirQuality", () => {
  it("requests us_aqi from the air-quality host with the right window", async () => {
    server.use(
      http.get(ENDPOINT, ({ request }) => {
        const p = new URL(request.url).searchParams;
        expect(p.get("latitude")).toBe("37.734");
        expect(p.get("longitude")).toBe("-119.637");
        expect(p.get("hourly")).toBe("us_aqi");
        expect(p.get("timezone")).toBe("auto");
        // 7 is the API's hard cap (8+ is a 400). It returns ~4.3-5 days of real
        // data regardless, but asking for 7 costs nothing and London measured
        // 8 hours beyond what the default of 5 returns.
        expect(p.get("forecast_days")).toBe("7");
        // The panel is forecast-only; past_days=0 starts the response at today
        // 00:00 local, exactly where forecastHourly begins.
        expect(p.get("past_days")).toBe("0");
        return HttpResponse.json(fixture);
      }),
    );

    const air = await fetchAirQuality(37.734, -119.637);
    expect(air.hourly).toHaveLength(4);
    expect(air.hourly[0]).toEqual({ datetime: "2026-09-08T00:00", usAqi: 42 });
  });

  it("preserves the trailing nulls rather than coercing them to zero", async () => {
    // A rendered AQI of 0 is a claim of pristine air, not an absence of data.
    // The panel relies on these nulls to break the line and draw its dead zone.
    server.use(http.get(ENDPOINT, () => HttpResponse.json(fixture)));

    const air = await fetchAirQuality(37.734, -119.637);
    expect(air.hourly.map(h => h.usAqi)).toEqual([42, 47, null, null]);
  });

  it("throws on a non-2xx response so the caller can fall back to null", async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.json({}, { status: 503 })));
    await expect(fetchAirQuality(37.734, -119.637)).rejects.toThrow("503");
  });

  it("returns an empty series when the payload carries no hourly block", async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.json({})));
    const air = await fetchAirQuality(37.734, -119.637);
    expect(air.hourly).toEqual([]);
  });
});
