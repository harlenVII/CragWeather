"use client";
import { useState } from "react";
import type { HourlyWeather } from "@/lib/weather";
import { TempPanel } from "@/components/TempPanel";
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

export function ForecastChart({ hourly }: { hourly: HourlyWeather[] }) {
  const [activePoint, setActivePoint] = useState<ActivePoint | null>(null);

  const tempData = hourly.map(h => ({
    x: h.datetime,
    temp: Math.round(h.temp),
    feelsLike: Math.round(h.feelsLike),
    dewPoint: Math.round(h.dewPoint),
  }));

  const windData = hourly.map(h => ({
    x: h.datetime,
    speed: Math.round(h.windSpeed),
    gust: Math.round(h.windGust),
  }));

  const dayTicks = hourly
    .filter(h => h.datetime.slice(11) === "00:00")
    .map(h => h.datetime);

  const sections = buildSections(hourly);
  const weekendBands = getWeekendBands(dayTicks, hourly.at(-1)?.datetime ?? "");
  const fmt = (v: string) => v.slice(5, 10);

  function handleHover(idx: number) {
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
  }

  function clear() {
    setActivePoint(null);
  }

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
