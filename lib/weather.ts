export type DailyWeather  = { date: string; tempMax: number; tempMin: number; precip: number; partial?: boolean; sunrise?: string; sunset?: string };
export type HourlyWeather = {
  datetime: string;
  temp: number;
  feelsLike: number;
  dewPoint: number;
  humidity: number;
  precip: number;
  precipChance: number | null;
  windSpeed: number;
  windGust: number;
};
export type WeatherResponse = { daily: DailyWeather[]; hourly: HourlyWeather[] };

type OmResponse = {
  daily: {
    time: string[];
    sunrise: (string | null)[];
    sunset: (string | null)[];
  };
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
    apparent_temperature: (number | null)[];
    dew_point_2m: (number | null)[];
    relative_humidity_2m: (number | null)[];
    precipitation: (number | null)[];
    precipitation_probability: (number | null)[];
    wind_speed_10m: (number | null)[];
    wind_gusts_10m: (number | null)[];
  };
};

/** Sunrise/sunset for a run of dates, as crag-local wall-clock strings. */
export type SunTimes = {
  time: string[];
  sunrise: (string | null)[];
  sunset: (string | null)[];
};

/**
 * Collapse hourly entries into one entry per calendar date.
 *
 * Daily values are derived here rather than read from Open-Meteo's own `daily`
 * block. The two agree exactly under `best_match` (measured: 0.000°C / 0.000mm
 * across 94 days at three crags), so this is not about accuracy — it is about
 * having one rule. `partialToday` in lib/sliceWeather.ts builds today's history
 * entry from hourly with these same max/min/sum rules, and today is rendered in
 * both sections; deriving both from the same source is what keeps them
 * comparable. It also means a null tail costs a shortened day rather than a
 * NaN one, since null hours never reach this function.
 */
export function aggregateDaily(hourly: HourlyWeather[], sun?: SunTimes): DailyWeather[] {
  const dayMap = new Map<string, HourlyWeather[]>();
  for (const h of hourly) {
    const date = h.datetime.slice(0, 10);
    if (!dayMap.has(date)) dayMap.set(date, []);
    dayMap.get(date)!.push(h);
  }

  // Sun times are astronomy, not forecast: they arrive per date rather than per
  // hour, so they are joined by date rather than by position.
  const sunByDate = new Map<string, { sunrise?: string; sunset?: string }>();
  if (sun) {
    for (let i = 0; i < sun.time.length; i++) {
      sunByDate.set(sun.time[i], {
        sunrise: sun.sunrise[i] ?? undefined,
        sunset: sun.sunset[i] ?? undefined,
      });
    }
  }

  const daily: DailyWeather[] = [];
  for (const [date, hours] of dayMap) {
    daily.push({
      date,
      tempMax: Math.max(...hours.map(h => h.temp)),
      tempMin: Math.min(...hours.map(h => h.temp)),
      precip: hours.reduce((s, h) => s + h.precip, 0),
      ...sunByDate.get(date),
    });
  }

  return daily;
}

export async function fetchWeather(
  lat: number,
  lng: number,
  fetcher: typeof fetch = fetch,
): Promise<WeatherResponse> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("past_days", "16");
  url.searchParams.set("forecast_days", "16");
  url.searchParams.set(
    "hourly",
    "temperature_2m,apparent_temperature,dew_point_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m",
  );
  // Sun times are the only daily fields requested; every other daily value is
  // derived from the hourly entries in aggregateDaily.
  url.searchParams.set("daily", "sunrise,sunset");
  // Open-Meteo defaults to km/h; the explicit param keeps m/s throughout.
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("timezone", "auto");

  // No `models` param — see the "Weather model" section of CLAUDE.md. Open-Meteo's
  // default `best_match` already walks high-resolution → regional → global per
  // location, which is what a hand-rolled stitcher was doing.

  const res = await fetcher(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);

  const j: OmResponse = await res.json();

  // `best_match` ends in a short null tail (measured: 3 hours at Céüse, 2 at
  // Kalymnos on a 768-slot window). A slot with no temperature carries no usable
  // reading at all, so it is dropped rather than emitted as `temp: null` — which
  // is what put a NaN tempMax on the final day.
  const hourly: HourlyWeather[] = [];
  for (let i = 0; i < j.hourly.time.length; i++) {
    const temp = j.hourly.temperature_2m[i];
    if (temp == null) continue;
    hourly.push({
      datetime: j.hourly.time[i],
      temp,
      feelsLike: j.hourly.apparent_temperature[i] ?? temp,
      dewPoint: j.hourly.dew_point_2m[i] ?? 0,
      humidity: j.hourly.relative_humidity_2m[i] ?? 0,
      precip: j.hourly.precipitation[i] ?? 0,
      // `?? null` rather than `?? 0`: a rendered "0%" is a claim, an absence is
      // not. Probability runs out before temperature does — measured at Céüse,
      // a single trailing run of 28 null hours past the end of the probability
      // horizon, with past and near-term hours fully populated.
      precipChance: j.hourly.precipitation_probability?.[i] ?? null,
      windSpeed: j.hourly.wind_speed_10m[i] ?? 0,
      windGust: j.hourly.wind_gusts_10m[i] ?? 0,
    });
  }

  const sun: SunTimes | undefined = j.daily && {
    time: j.daily.time,
    sunrise: j.daily.sunrise ?? [],
    sunset: j.daily.sunset ?? [],
  };

  return { daily: aggregateDaily(hourly, sun), hourly };
}
