import type { DailyWeather, HourlyWeather } from "@/lib/weather";

export type SlicedWeather = {
  forecastHourly: HourlyWeather[];
  forecastDaily: DailyWeather[];
  historyDaily: DailyWeather[];
};

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function sliceWeather(
  weather: { daily: DailyWeather[]; hourly: HourlyWeather[] },
  today: string,
  days: number,
): SlicedWeather {
  const forecastEnd = addDays(today, days);
  const historyStart = addDays(today, -days);
  return {
    forecastHourly: weather.hourly.filter(h => {
      const d = h.datetime.slice(0, 10);
      return d >= today && d < forecastEnd;
    }),
    forecastDaily: weather.daily.filter(d => d.date >= today && d.date < forecastEnd),
    historyDaily: weather.daily.filter(d => d.date >= historyStart && d.date < today),
  };
}
