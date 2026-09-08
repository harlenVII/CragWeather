"use client";
import { useCallback, useMemo, useState } from "react";
import type { DailyWeather, HourlyWeather } from "@/lib/weather";
import { TempPanel } from "@/components/TempPanel";
import { PrecipPanel } from "@/components/PrecipPanel";
import { HumidityPanel } from "@/components/HumidityPanel";
import { DewPointPanel } from "@/components/DewPointPanel";
import { WindPanel } from "@/components/WindPanel";
import { buildSections } from "@/lib/modelSections";
import { getWeekendBands } from "@/lib/weekendBands";
import { getNightBands } from "@/lib/nightBands";
import { GOOD_MAX_C, GREASY_MIN_C } from "@/lib/dewPointBands";
import type { AirQualityResponse } from "@/lib/airQuality";
import { AirQualityPanel } from "@/components/AirQualityPanel";
import { aqiCategory, formatAqiCutoff, lastCoveredIndex } from "@/lib/aqiBands";

type ActivePoint = {
  datetime: string;
  temp: number;
  feelsLike: number;
  dewPoint: number;
  humidity: number;
  precip: number;
  precipChance: number | null;
  windSpeed: number;
  windGust: number;
  aqi: number | null;
};

// Everything below the hover state is memoised on purpose, and the five panels
// are wrapped in React.memo. `setActivePoint` fires on every mousemove, and this
// component is the parent of all five charts — without both halves of that, every
// mouse move re-renders ~2,000 SVG nodes to update a handful of <span>s in the
// tooltip strip. Measured on a 15-day window: frame p50 94ms and 58 long tasks,
// down to 17ms and zero. Neither half works alone — React.memo without stable
// props is a no-op, and stable props without React.memo still re-render because
// the parent did (memoising the data arrays by themselves moved p50 only 94ms to
// 88ms). The jank also scaled with the day window before the fix and is flat now.
export function ForecastChart({
  hourly,
  daily,
  air,
}: {
  hourly: HourlyWeather[];
  daily?: DailyWeather[];
  air?: AirQualityResponse | null;
}) {
  const [activePoint, setActivePoint] = useState<ActivePoint | null>(null);

  const tempData = useMemo(() => hourly.map(h => ({
    x: h.datetime,
    temp: Math.round(h.temp),
    feelsLike: Math.round(h.feelsLike),
  })), [hourly]);

  // Dew point alone. Temperature used to be carried here so the panel could plot
  // both and let the reader take the gap as a condensation signal — but rock wets
  // when its own surface drops below the dew point, not when air temperature
  // nears it, so the gap was answering a question the data cannot answer. The
  // temperature comparison survives where it is honest: it is plotted on panel 1
  // against the same x-axis, and the hover strip carries both numbers at once.
  const dewPointData = useMemo(() => hourly.map(h => ({
    x: h.datetime,
    dewPoint: Math.round(h.dewPoint),
  })), [hourly]);

  const precipData = useMemo(() => hourly.map(h => ({
    x: h.datetime,
    precip: h.precip,
    chance: h.precipChance,
  })), [hourly]);

  const windData = useMemo(() => hourly.map(h => ({
    x: h.datetime,
    speed: Math.round(h.windSpeed),
    gust: Math.round(h.windGust),
  })), [hourly]);

  const humidityData = useMemo(() => hourly.map(h => ({
    x: h.datetime,
    humidity: Math.round(h.humidity),
  })), [hourly]);

  // Joined to the weather hours by exact datetime rather than by position: both
  // calls use timezone=auto at the same coordinates, so the local wall-clock
  // strings match hour for hour. Mapping over `hourly` (not over air.hourly) is
  // what makes the panel's x-axis identical by construction to the five panels
  // above — same length, same x values, same ticks — which is why it can join
  // panelAlignment.test.tsx. It also means the day-window slice propagates for
  // free: `hourly` is already sliced, so AQ needs no slicing of its own.
  const aqiByHour = useMemo(
    () => air ? new Map(air.hourly.map(a => [a.datetime, a.usAqi])) : null,
    [air],
  );

  const aqiData = useMemo(
    () => hourly.map(h => ({ x: h.datetime, aqi: aqiByHour?.get(h.datetime) ?? null })),
    [hourly, aqiByHour],
  );

  // CAMS reaches only ~4.3-5.0 days against a 7/10/15-day window, so the panel
  // is normally partly empty. `covered` marks the last hour it reaches: -1 means
  // there is nothing to show at all and the whole section is dropped.
  const aqiCovered = useMemo(() => lastCoveredIndex(aqiData.map(d => d.aqi)), [aqiData]);
  const showAqi = aqiCovered >= 0;
  const aqiCutoff = showAqi && aqiCovered < aqiData.length - 1 ? aqiData[aqiCovered].x : null;

  const dayTicks = useMemo(() => hourly
    .filter(h => h.datetime.slice(11) === "00:00")
    .map(h => h.datetime), [hourly]);

  const sections = useMemo(() => buildSections(hourly), [hourly]);
  const weekendBands = useMemo(() => getWeekendBands(dayTicks, hourly.at(-1)?.datetime ?? ""), [dayTicks, hourly]);

  // Sun times ride on `daily` rather than on the hours, so the bands are built
  // here and clipped to the visible hourly domain — which is already sliced to
  // the 7/10/15-day window, so the shading follows the picker for free.
  const nightBands = useMemo(() => daily && hourly.length > 0
    ? getNightBands(daily, hourly[0].datetime, hourly[hourly.length - 1].datetime)
    : [], [daily, hourly]);
  const fmt = useCallback((v: string) => v.slice(5, 10), []);

  const handleHover = useCallback((idx: number) => {
    if (idx < 0 || idx >= hourly.length) return;
    const h = hourly[idx];
    setActivePoint({
      datetime: h.datetime,
      temp: Math.round(h.temp),
      feelsLike: Math.round(h.feelsLike),
      dewPoint: Math.round(h.dewPoint),
      humidity: Math.round(h.humidity),
      precip: h.precip,
      precipChance: h.precipChance,
      windSpeed: Math.round(h.windSpeed),
      windGust: Math.round(h.windGust),
      aqi: aqiData[idx]?.aqi ?? null,
    });
  }, [hourly, aqiData]);

  const clear = useCallback(() => setActivePoint(null), []);

  return (
    <div className="chart-wrap">
      <div className="chart-tooltip-strip">
        {activePoint ? (
          <>
            <span>{activePoint.datetime.replace("T", " ")}</span>
            <span style={{ color: "#dc2626" }}>{activePoint.temp}°C</span>
            <span style={{ color: "#f87171" }}>feels {activePoint.feelsLike}°C</span>
            <span style={{ color: "#6b7280" }}>dew {activePoint.dewPoint}°C</span>
            <span style={{ color: "#60a5fa" }}>{activePoint.precip.toFixed(1)} mm</span>
            {activePoint.precipChance !== null && (
              <span style={{ color: "#2563eb" }}>{activePoint.precipChance}%</span>
            )}
            <span style={{ color: "#0891b2" }}>{activePoint.humidity}% RH</span>
            <span style={{ color: "#059669" }}>{activePoint.windSpeed} m/s</span>
            <span style={{ color: "#6b7280" }}>{activePoint.windGust} m/s gust</span>
            {activePoint.aqi !== null && (
              <span style={{ color: aqiCategory(activePoint.aqi).fill }}>
                AQI {activePoint.aqi}
              </span>
            )}
          </>
        ) : (
          <span style={{ color: "var(--muted)" }}>—</span>
        )}
      </div>
      <div className="chart-scroll">
        <div className="chart-inner">
          <TempPanel
            data={tempData}
            sections={sections}
            ticks={dayTicks}
            tickFormatter={fmt}
            weekendBands={weekendBands}
            nightBands={nightBands}
            onHover={handleHover}
            onLeave={clear}
          />
          <PrecipPanel
            data={precipData}
            ticks={dayTicks}
            tickFormatter={fmt}
            weekendBands={weekendBands}
            nightBands={nightBands}
            onHover={handleHover}
            onLeave={clear}
          />
          <WindPanel
            data={windData}
            ticks={dayTicks}
            tickFormatter={fmt}
            weekendBands={weekendBands}
            nightBands={nightBands}
            onHover={handleHover}
            onLeave={clear}
          />
          <DewPointPanel
            data={dewPointData}
            ticks={dayTicks}
            tickFormatter={fmt}
            weekendBands={weekendBands}
            nightBands={nightBands}
            onHover={handleHover}
            onLeave={clear}
          />
          <p className="chart-note">
            <strong>Dew point</strong> is the temperature air must cool to before it
            saturates — a direct read on how much moisture the air is carrying. Below
            ~{GOOD_MAX_C}°C the air is dry and friction is good; above ~{GREASY_MIN_C}°C
            rock feels greasy. Any surface colder than the dew point will sweat, so cold
            rock under warm humid air goes damp even without rain.
          </p>
          <HumidityPanel
            data={humidityData}
            ticks={dayTicks}
            tickFormatter={fmt}
            weekendBands={weekendBands}
            nightBands={nightBands}
            onHover={handleHover}
            onLeave={clear}
          />
          {showAqi && (
            <>
              <AirQualityPanel
                data={aqiData}
                ticks={dayTicks}
                tickFormatter={fmt}
                onHover={handleHover}
                onLeave={clear}
              />
              {aqiCutoff && (
                <p className="chart-note">
                  Air-quality forecast ends <strong>{formatAqiCutoff(aqiCutoff)}</strong>.
                  CAMS does not forecast further ahead — the shaded hours have no data.
                </p>
              )}
              <p className="chart-note">
                <strong>US AQI</strong> combines several pollutants into one 0–500 scale;
                at a crag the thing that usually moves it is wildfire smoke. Under 50 is
                clean air. The forecast comes from CAMS at ~45 km resolution, so it will
                not resolve a valley inversion or a single plume — nearby crags read the
                same, and local smoke can be much worse than shown.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
