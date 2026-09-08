/**
 * US AQI category breakpoints and the y-axis domain that keeps them on scale.
 *
 * Breakpoints and domain live in one file, unlike the dewPointBands/tempDomain
 * split: there the domain function is shared by two panels, here it exists only
 * to keep these bands renderable, so splitting one panel's constants across two
 * files buys nothing.
 */

export type AqiBand = { min: number; max: number; label: string; fill: string };

/**
 * EPA US AQI categories.
 *
 * Bounds are contiguous (each band's `min` is the previous band's `max`) so the
 * rendered ReferenceAreas leave no unpainted stripe between them. EPA states the
 * categories as 0-50 / 51-100 / 101-150 …; `aqiCategory` reproduces that by
 * taking the first band whose `max` the value does not exceed, so 50 is Good and
 * 51 is Moderate despite the shared 50 boundary.
 */
export const AQI_BANDS: readonly AqiBand[] = [
  { min:   0, max:  50, label: "Good",                  fill: "#00e400" },
  { min:  50, max: 100, label: "Moderate",              fill: "#ffff00" },
  { min: 100, max: 150, label: "Unhealthy (sensitive)", fill: "#ff7e00" },
  { min: 150, max: 200, label: "Unhealthy",             fill: "#ff0000" },
  { min: 200, max: 300, label: "Very unhealthy",        fill: "#8f3f97" },
  { min: 300, max: 500, label: "Hazardous",             fill: "#7e0023" },
];

/**
 * Smallest ceiling the AQI axis will ever show.
 *
 * Clean-air crags sit far below it (measured: Yosemite 17-52, London 19-53), and
 * an auto-fitted axis would stretch that to full height so a "Good" day reads as
 * an emergency — with the scale changing silently between crags and between the
 * 7/10/15-day windows, since the day selector slices before the panel sees the
 * data. At 100 the Good band is always the bottom half and Moderate the top half,
 * so a given line height means the same air everywhere. 100 rather than 50
 * because a floor of 50 would clip Yosemite's own measured peak of 52.
 *
 * It also keeps the bands renderable at all: a Recharts ReferenceArea lying
 * outside the domain is discarded entirely rather than clipped.
 */
export const AQI_AXIS_FLOOR = 100;

/** Headroom above a peak, in AQI points, so the line never touches the panel edge. */
export const AQI_PAD = 10;

/**
 * Y-axis domain for the air-quality panel.
 *
 * Zero is kept as the lower bound. Unlike temperature — an interval scale, where
 * `tempDomain` deliberately floats the minimum — AQI is a ratio scale on which
 * zero means "none", the same property that keeps zero on the precipitation,
 * wind and humidity axes.
 */
export function aqiDomain(values: (number | null)[]): [number, number] {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  const peak = finite.length > 0 ? Math.max(...finite) : 0;
  return [0, Math.max(AQI_AXIS_FLOOR, Math.ceil(peak) + AQI_PAD)];
}

/** The EPA category a value falls in. Values above the scale clamp to the top band. */
export function aqiCategory(value: number): AqiBand {
  return AQI_BANDS.find(b => value <= b.max) ?? AQI_BANDS[AQI_BANDS.length - 1];
}

/**
 * The bands that intersect the current domain, clamped to it.
 *
 * Drawing all six always would make every panel a permanent rainbow; drawing
 * only what the axis reaches means a clean day is calm and a smoke day lights up.
 */
export function visibleBands(domainMax: number): AqiBand[] {
  return AQI_BANDS
    .filter(b => b.min < domainMax)
    .map(b => ({ ...b, max: Math.min(b.max, domainMax) }));
}

/**
 * Index of the last non-null value, or -1 if there is none.
 *
 * CAMS coverage is a contiguous prefix followed by a clean null tail (verified
 * across every variable: zero interior gaps), so this one index fully describes
 * where the forecast stops.
 */
export function lastCoveredIndex(values: (number | null)[]): number {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] != null) return i;
  }
  return -1;
}

/**
 * Every maximal run of null indices in `values`, as `{ start, end }` (both
 * inclusive).
 *
 * `lastCoveredIndex` alone only describes a trailing tail, which is the shape
 * CAMS itself returns. But the panel's series is a *join* against the weather
 * hours (ForecastChart keys `aqiData` off `hourly`, not off `air.hourly`), and
 * those two arrays can start from different calendar dates — the AQ fetch uses
 * the crag-local date, the weather slice uses the viewer's browser-clock date
 * (see lib/airQuality.ts). When the crag is a day ahead of the viewer, the
 * joined series opens with a null run before AQ coverage begins, not just a
 * tail at the end. This function makes no assumption about where nulls fall,
 * so the dead-zone rendering stays honest regardless of which clock produced
 * the gap.
 */
export function nullRuns(values: (number | null)[]): { start: number; end: number }[] {
  const runs: { start: number; end: number }[] = [];
  let start: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) {
      if (start === null) start = i;
    } else if (start !== null) {
      runs.push({ start, end: i - 1 });
      start = null;
    }
  }
  if (start !== null) runs.push({ start, end: values.length - 1 });
  return runs;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2026-09-12T06:00" -> "12 Sep, 06:00".
 *
 * Read positionally out of the string, never through `new Date(...)`. Open-Meteo
 * timestamps are crag-local wall clock (timezone=auto), so parsing one into a
 * Date reinterprets it in the viewer's timezone — the same trap `localDayAndHour`
 * exists to avoid.
 */
export function formatAqiCutoff(iso: string): string {
  const day = Number(iso.slice(8, 10));
  const month = MONTHS[Number(iso.slice(5, 7)) - 1];
  const time = iso.slice(11, 16);
  return `${day} ${month}, ${time}`;
}
