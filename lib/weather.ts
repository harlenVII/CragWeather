export type DailyWeather  = { date: string; tempMax: number; tempMin: number; precip: number; model?: string };
export type HourlyWeather = { datetime: string; temp: number; precip: number; windSpeed: number; windGust: number; model?: string };
export type WeatherResponse = { daily: DailyWeather[]; hourly: HourlyWeather[] };

type OmResponse = {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
  };
};

type OmHourlyResponse = {
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
    precipitation: (number | null)[];
    wind_speed_10m: (number | null)[];
    wind_gusts_10m: (number | null)[];
  };
};

type OmMultiResponse = {
  hourly: { time: string[]; [key: string]: (number | null)[] | string[] };
};

const NA_MODELS = [
  { id: "ncep_hrrr_conus", label: "HRRR" },
  { id: "ncep_nam_conus",  label: "NAM"  },
  { id: "gfs_global",      label: "GFS"  },
];

export function isNorthAmerica(lat: number, lng: number): boolean {
  return lat >= 7 && lat <= 84 && lng >= -169 && lng <= -52;
}

export function stitchModels(responses: OmHourlyResponse[], names: string[]): WeatherResponse {
  const hlen = responses[0].hourly.time.length;
  const hourly: HourlyWeather[] = [];
  for (let i = 0; i < hlen; i++) {
    for (let m = 0; m < responses.length; m++) {
      const r = responses[m];
      if (r.hourly.temperature_2m[i] != null) {
        hourly.push({
          datetime: r.hourly.time[i],
          temp: r.hourly.temperature_2m[i]!,
          precip: r.hourly.precipitation[i] ?? 0,
          windSpeed: r.hourly.wind_speed_10m[i] ?? 0,
          windGust: r.hourly.wind_gusts_10m[i] ?? 0,
          model: names[m],
        });
        break;
      }
    }
  }

  const dayMap = new Map<string, HourlyWeather[]>();
  for (const h of hourly) {
    const date = h.datetime.slice(0, 10);
    if (!dayMap.has(date)) dayMap.set(date, []);
    dayMap.get(date)!.push(h);
  }

  const daily: DailyWeather[] = [];
  for (const [date, hours] of dayMap) {
    const seenModels: string[] = [];
    for (const h of hours) {
      if (h.model && !seenModels.includes(h.model)) seenModels.push(h.model);
    }
    const model = seenModels.length > 0 ? seenModels.join(" & ") : undefined;
    daily.push({
      date,
      tempMax: Math.max(...hours.map(h => h.temp)),
      tempMin: Math.min(...hours.map(h => h.temp)),
      precip: hours.reduce((s, h) => s + h.precip, 0),
      model,
    });
  }

  return { daily, hourly };
}

export async function fetchWeather(
  lat: number,
  lng: number,
  fetcher: typeof fetch = fetch,
): Promise<WeatherResponse> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("past_days", "7");
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("hourly", "temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m");
  url.searchParams.set("timezone", "auto");

  const na = isNorthAmerica(lat, lng);
  if (na) {
    url.searchParams.set("models", NA_MODELS.map(m => m.id).join(","));
    // No daily param — daily values are derived from stitched hourly in stitchModels.
    // ERA5 covers past slots; HRRR/NAM/GFS cover future slots. Null-driven stitching
    // handles the past/future split automatically.
  } else {
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum");
  }

  const res = await fetcher(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);

  if (na) {
    const j: OmMultiResponse = await res.json();
    const responses: OmHourlyResponse[] = NA_MODELS.map(m => ({
      hourly: {
        time: j.hourly.time as string[],
        temperature_2m:  j.hourly[`temperature_2m_${m.id}`]  as (number | null)[],
        precipitation:   j.hourly[`precipitation_${m.id}`]   as (number | null)[],
        wind_speed_10m:  j.hourly[`wind_speed_10m_${m.id}`]  as (number | null)[],
        wind_gusts_10m:  j.hourly[`wind_gusts_10m_${m.id}`]  as (number | null)[],
      },
    }));
    return stitchModels(responses, NA_MODELS.map(m => m.label));
  }

  const j: OmResponse = await res.json();
  const daily = j.daily.time.map((t, i) => ({
    date: t,
    tempMax: j.daily.temperature_2m_max[i] as number,
    tempMin: j.daily.temperature_2m_min[i] as number,
    precip: j.daily.precipitation_sum[i] ?? 0,
  }));
  const hourly = j.hourly.time.map((t, i) => ({
    datetime: t,
    temp: j.hourly.temperature_2m[i] as number,
    precip: j.hourly.precipitation[i] ?? 0,
    windSpeed: j.hourly.wind_speed_10m[i] ?? 0,
    windGust: j.hourly.wind_gusts_10m[i] ?? 0,
  }));
  return { daily, hourly };
}
