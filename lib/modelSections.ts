import type { HourlyWeather } from "@/lib/weather";

export type Section = { model: string; start: string; mid: string; end: string };

export function buildSections(hourly: HourlyWeather[]): Section[] {
  const buckets: { model: string; hours: string[] }[] = [];
  for (const h of hourly) {
    if (!h.model) continue;
    const last = buckets.at(-1);
    if (!last || last.model !== h.model) {
      buckets.push({ model: h.model, hours: [h.datetime] });
    } else {
      last.hours.push(h.datetime);
    }
  }
  return buckets.map(b => ({
    model: b.model,
    start: b.hours[0],
    mid: b.hours[Math.floor(b.hours.length / 2)],
    end: b.hours[b.hours.length - 1],
  }));
}
