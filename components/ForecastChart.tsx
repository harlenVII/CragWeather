"use client";
import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HourlyWeather } from "@/lib/weather";
import { WindPanel } from "@/components/WindPanel";

type Section = { model: string; start: string; mid: string; end: string };

type ActivePoint = {
  datetime: string;
  temp: number;
  precip: number;
  windSpeed: number;
  windGust: number;
};

function buildSections(hourly: HourlyWeather[]): Section[] {
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

export function ForecastChart({ hourly }: { hourly: HourlyWeather[] }) {
  const [activePoint, setActivePoint] = useState<ActivePoint | null>(null);

  const data = hourly.map(h => ({
    datetime: h.datetime,
    temp: Math.round(h.temp),
    precip: h.precip,
  }));

  const windData = hourly.map(h => ({
    x: h.datetime,
    speed: Math.round(h.windSpeed),
    gust: Math.round(h.windGust),
  }));

  const dayTicks = data
    .filter(d => d.datetime.slice(11) === "00:00")
    .map(d => d.datetime);

  const sections = buildSections(hourly);

  function handleHover(idx: number) {
    if (idx < 0 || idx >= data.length) return;
    setActivePoint({
      datetime: data[idx].datetime,
      temp: data[idx].temp,
      precip: data[idx].precip,
      windSpeed: windData[idx].speed,
      windGust: windData[idx].gust,
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
            <span style={{ color: "#60a5fa" }}>{activePoint.precip.toFixed(1)} mm</span>
            <span style={{ color: "#059669" }}>{activePoint.windSpeed} m/s</span>
            <span style={{ color: "#6b7280" }}>{activePoint.windGust} m/s gust</span>
          </>
        ) : (
          <span style={{ color: "var(--muted)" }}>—</span>
        )}
      </div>
      <div className="chart-scroll">
        <div className="chart-inner">
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              data={data}
              margin={{ top: 32, right: 32, bottom: 16, left: 0 }}
              onMouseMove={(state) => {
                const idx = state.activeTooltipIndex;
                if (typeof idx === "number") handleHover(idx);
              }}
              onTouchMove={(state) => {
                const idx = state.activeTooltipIndex;
                if (typeof idx === "number") handleHover(idx);
              }}
              onTouchStart={(state) => {
                const idx = state.activeTooltipIndex;
                if (typeof idx === "number") handleHover(idx);
              }}
              onMouseLeave={clear}
              onTouchEnd={clear}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis
                dataKey="datetime"
                ticks={dayTicks}
                tickFormatter={(v: string) => v.slice(5, 10)}
              />
              <YAxis yAxisId="precip" orientation="left" label={{ value: "mm", angle: -90, position: "insideLeft" }} />
              <YAxis yAxisId="temp" orientation="right" width={48} label={{ value: "°C", angle: 90, position: "insideRight" }} />
              <Legend />
              <Tooltip content={() => null} />

              {sections.map(s => (
                <ReferenceLine
                  key={`label-${s.start}`}
                  x={s.mid}
                  yAxisId="temp"
                  stroke="none"
                  label={{ value: s.model, position: "top", fill: "#6b7280", fontSize: 11, fontWeight: 500 }}
                />
              ))}

              {sections.slice(1).map(s => (
                <ReferenceLine
                  key={`div-${s.start}`}
                  x={s.start}
                  yAxisId="temp"
                  stroke="#d1d5db"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
              ))}

              <Bar yAxisId="precip" dataKey="precip" name="Precip (mm)" fill="#60a5fa" />
              <Line yAxisId="temp" dataKey="temp" name="Temp (°C)" stroke="#dc2626" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <WindPanel
            data={windData}
            ticks={dayTicks}
            tickFormatter={(v: string) => v.slice(5, 10)}
            onHover={handleHover}
            onLeave={clear}
          />
        </div>
      </div>
    </div>
  );
}
