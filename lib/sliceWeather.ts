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

// Open-Meteo timestamps are crag-local (timezone=auto), so the "today" boundary
// must come from local calendar parts. Using toISOString() here would roll over
// to tomorrow's date during the evening in western timezones.
export function localDayAndHour(now: Date): { today: string; nowHour: number } {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    nowHour: now.getHours(),
  };
}

// Today's `daily` entry from stitchModels spans the whole day (elapsed hours plus
// the rest of the day's forecast), so it can't be reused for history. Build a
// separate entry from the hours that have actually elapsed, aggregated the same
// way stitchModels derives its daily values.
function partialToday(hourly: HourlyWeather[], today: string, nowHour: number): DailyWeather | null {
  const hours = hourly.filter(
    h => h.datetime.slice(0, 10) === today && Number(h.datetime.slice(11, 13)) <= nowHour,
  );
  if (hours.length === 0) return null;

  const models: string[] = [];
  for (const h of hours) {
    if (h.model && !models.includes(h.model)) models.push(h.model);
  }

  return {
    date: today,
    tempMax: Math.max(...hours.map(h => h.temp)),
    tempMin: Math.min(...hours.map(h => h.temp)),
    precip: hours.reduce((s, h) => s + h.precip, 0),
    model: models.length > 0 ? models.join(" & ") : undefined,
    partial: true,
  };
}

export function sliceWeather(
  weather: { daily: DailyWeather[]; hourly: HourlyWeather[] },
  today: string,
  days: number,
  nowHour?: number,
): SlicedWeather {
  const forecastEnd = addDays(today, days);
  const historyStart = addDays(today, -days);

  const historyDaily = weather.daily.filter(d => d.date >= historyStart && d.date < today);
  if (nowHour !== undefined) {
    const partial = partialToday(weather.hourly, today, nowHour);
    if (partial) historyDaily.push(partial);
  }

  return {
    forecastHourly: weather.hourly.filter(h => {
      const d = h.datetime.slice(0, 10);
      return d >= today && d < forecastEnd;
    }),
    forecastDaily: weather.daily.filter(d => d.date >= today && d.date < forecastEnd),
    historyDaily,
  };
}
