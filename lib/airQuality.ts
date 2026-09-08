/**
 * Air quality, from Open-Meteo's separate CAMS-backed endpoint.
 *
 * Deliberately isolated from lib/weather.ts. There is no model stitching here:
 * CAMS has no model-priority walk to run and no per-hour provenance to badge,
 * and the two sources have different horizons and independent failure modes.
 * Callers must treat a failure as non-fatal — the weather page renders without it.
 */

export type HourlyAir = { datetime: string; usAqi: number | null };
export type AirQualityResponse = { hourly: HourlyAir[] };

type OmAirResponse = {
  hourly?: { time: string[]; us_aqi: (number | null)[] };
};

export async function fetchAirQuality(
  lat: number,
  lng: number,
  fetcher: typeof fetch = fetch,
): Promise<AirQualityResponse> {
  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("hourly", "us_aqi");
  url.searchParams.set("timezone", "auto");
  // 7 is the hard cap — forecast_days=8 is a 400. The response still trails off
  // into nulls after ~4.3-5.0 days depending on location; that tail is expected
  // and is what the panel's dead zone draws.
  url.searchParams.set("forecast_days", "7");
  // past_days=1, not 0. This response starts at the crag-local calendar date at
  // fetch time; forecastHourly is sliced against `today` derived from the
  // *viewer's* browser clock (lib/sliceWeather.ts, WeatherView.tsx). When the
  // crag's local date is already ahead of the viewer's (a US viewer on a
  // European/Australian route, or any /at/[coords] page east of the viewer),
  // forecastHourly opens with hours from a crag-local day that had already
  // ended when this was fetched — hours this response would not otherwise
  // cover, producing a leading null run in the joined series. The maximum
  // timezone spread is UTC-12 to UTC+14 (26 hours), so the two calendar dates
  // can differ by at most one day — one day of lookback fully covers it. The
  // extra hourly entries this pulls in that match no weather hour are silently
  // ignored by the datetime-keyed join in ForecastChart, so this costs nothing
  // downstream.
  url.searchParams.set("past_days", "1");
  // `domains` is left at its default of `auto` (CAMS Europe 11km blended with
  // CAMS global 45km); there is nothing to gain by pinning it.

  const res = await fetcher(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Open-Meteo air quality returned ${res.status}`);

  const j: OmAirResponse = await res.json();
  if (!j.hourly?.time) return { hourly: [] };

  return {
    hourly: j.hourly.time.map((t, i) => ({
      datetime: t,
      // Null is carried through, never defaulted to 0 — see the module comment.
      usAqi: j.hourly!.us_aqi?.[i] ?? null,
    })),
  };
}
