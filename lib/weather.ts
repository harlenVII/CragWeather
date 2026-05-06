export type DailyWeather  = { date: string; tempMax: number; tempMin: number; precip: number };
export type HourlyWeather = { datetime: string; temp: number; precip: number };
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
  };
};

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
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum");
  url.searchParams.set("hourly", "temperature_2m,precipitation");
  url.searchParams.set("timezone", "auto");

  const res = await fetcher(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
  const j: OmResponse = await res.json();

  const daily = j.daily.time.map((t, i) => ({
    date: t,
    tempMax: j.daily.temperature_2m_max[i],
    tempMin: j.daily.temperature_2m_min[i],
    precip: j.daily.precipitation_sum[i],
  }));
  const hourly = j.hourly.time.map((t, i) => ({
    datetime: t,
    temp: j.hourly.temperature_2m[i],
    precip: j.hourly.precipitation[i],
  }));
  return { daily, hourly };
}
