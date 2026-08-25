export type WeekendBand = { start: string; end: string };

/** Given midnight tick datetimes (e.g. "2026-08-25T00:00"), returns the
 * start/end range of each Saturday/Sunday for shading on a chart x-axis. */
export function getWeekendBands(ticks: string[], lastDatetime: string): WeekendBand[] {
  const bands: WeekendBand[] = [];
  for (let i = 0; i < ticks.length; i++) {
    const [y, m, d] = ticks[i].slice(0, 10).split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow === 0 || dow === 6) {
      const end = i + 1 < ticks.length ? ticks[i + 1] : lastDatetime;
      bands.push({ start: ticks[i], end });
    }
  }
  return bands;
}
