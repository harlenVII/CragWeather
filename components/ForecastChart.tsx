"use client";
import { useCallback, useMemo, useState } from "react";
import type { HourlyWeather } from "@/lib/weather";
import { TempPanel } from "@/components/TempPanel";
import { PrecipPanel } from "@/components/PrecipPanel";
import { HumidityPanel } from "@/components/HumidityPanel";
import { DewPointPanel } from "@/components/DewPointPanel";
import { WindPanel } from "@/components/WindPanel";
import { buildSections } from "@/lib/modelSections";
import { getWeekendBands } from "@/lib/weekendBands";

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
export function ForecastChart({ hourly }: { hourly: HourlyWeather[] }) {
  const [activePoint, setActivePoint] = useState<ActivePoint | null>(null);

  const tempData = useMemo(() => hourly.map(h => ({
    x: h.datetime,
    temp: Math.round(h.temp),
    feelsLike: Math.round(h.feelsLike),
  })), [hourly]);

  // Temperature is repeated here on purpose: dew point is only meaningful read
  // against it, and the gap between the two lines is the condensation signal.
  const dewPointData = useMemo(() => hourly.map(h => ({
    x: h.datetime,
    temp: Math.round(h.temp),
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

  const dayTicks = useMemo(() => hourly
    .filter(h => h.datetime.slice(11) === "00:00")
    .map(h => h.datetime), [hourly]);

  const sections = useMemo(() => buildSections(hourly), [hourly]);
  const weekendBands = useMemo(() => getWeekendBands(dayTicks, hourly.at(-1)?.datetime ?? ""), [dayTicks, hourly]);
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
    });
  }, [hourly]);

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
            onHover={handleHover}
            onLeave={clear}
          />
          <PrecipPanel
            data={precipData}
            ticks={dayTicks}
            tickFormatter={fmt}
            weekendBands={weekendBands}
            onHover={handleHover}
            onLeave={clear}
          />
          <HumidityPanel
            data={humidityData}
            ticks={dayTicks}
            tickFormatter={fmt}
            weekendBands={weekendBands}
            onHover={handleHover}
            onLeave={clear}
          />
          <DewPointPanel
            data={dewPointData}
            ticks={dayTicks}
            tickFormatter={fmt}
            weekendBands={weekendBands}
            onHover={handleHover}
            onLeave={clear}
          />
          <p className="chart-note">
            <strong>Dew point</strong> is the temperature at which air becomes saturated.
            When the temperature line drops toward the dew-point line, moisture condenses
            and rock goes damp even without rain. Below ~5°C means dry air and better
            friction; above ~15°C feels greasy.
          </p>
          <WindPanel
            data={windData}
            ticks={dayTicks}
            tickFormatter={fmt}
            weekendBands={weekendBands}
            onHover={handleHover}
            onLeave={clear}
          />
        </div>
      </div>
    </div>
  );
}
