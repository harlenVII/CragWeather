import type { DailyWeather } from "@/lib/weather";
import type { WeekendBand } from "@/lib/weekendBands";

/** Recharts' x-axis here is a category scale keyed on the hourly datetime
 * strings, so a ReferenceArea boundary that is not itself one of those strings
 * is discarded rather than interpolated — "06:34" would simply not draw. Night
 * bands are therefore hour-resolution; the exact minutes live on the day cards.
 *
 * The naive crag-local string is anchored in UTC purely to do the arithmetic,
 * the same trick `addDays` uses in sliceWeather. It never consults the viewer's
 * timezone, so rounding 23:45 up to the next day's 00:00 stays exact. */
function snapToHour(ts: string): string {
  const d = new Date(`${ts}:00Z`);
  if (d.getUTCMinutes() >= 30) d.setUTCHours(d.getUTCHours() + 1);
  d.setUTCMinutes(0, 0, 0);
  return `${d.toISOString().slice(0, 13)}:00`;
}

/** Given daily entries carrying sunrise/sunset, returns the dark ranges to shade
 * on an hourly x-axis: each runs from one day's sunset to the next day's
 * sunrise, with the leading and trailing bands clipped to the visible domain.
 *
 * Days missing either value are skipped — above the arctic circle Open-Meteo
 * returns null for both, and a polar day has no night to draw. */
export function getNightBands(
  daily: DailyWeather[],
  firstHour: string,
  lastHour: string,
): WeekendBand[] {
  const bands: WeekendBand[] = [];
  const days = daily.filter(d => d.sunrise && d.sunset);
  if (days.length === 0) return bands;

  function push(start: string, end: string) {
    const s = start < firstHour ? firstHour : start;
    const e = end > lastHour ? lastHour : end;
    if (s < e) bands.push({ start: s, end: e });
  }

  push(firstHour, snapToHour(days[0].sunrise!));
  for (let i = 0; i < days.length - 1; i++) {
    push(snapToHour(days[i].sunset!), snapToHour(days[i + 1].sunrise!));
  }
  push(snapToHour(days[days.length - 1].sunset!), lastHour);

  return bands;
}
