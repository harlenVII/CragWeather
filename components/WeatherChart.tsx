"use client";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyWeather } from "@/lib/weather";
import { PanelLabel } from "@/components/PanelLabel";
import { SERIES, SERIES_VAR } from "@/lib/chartColors";

export function WeatherChart({ daily, nowHour }: { daily: DailyWeather[]; nowHour?: number }) {
  const partialDay = daily.find(d => d.partial);
  const data = daily.map((d) => ({
    date: d.date.slice(5) + (d.partial ? "*" : ""),  // MM-DD
    high: d.tempMax,
    low: d.tempMin,
    precip: d.precip,
    partial: d.partial ?? false,
  }));
  return (
    <div className="chart-wrap">
      <PanelLabel title="Past days" series={[
        { name: "High (°C)", className: SERIES.temp },
        { name: "Low (°C)", className: SERIES.low },
        { name: "Precip (mm)", className: SERIES.precip },
      ]} />
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 16, right: 32, bottom: 16, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis yAxisId="precip" orientation="left" label={{ value: "mm", angle: -90, position: "insideLeft" }} />
          <YAxis yAxisId="temp" orientation="right" label={{ value: "°C", angle: 90, position: "insideRight" }} />
          {/* This chart's Tooltip is live (unlike the six forecast panels, which
              pass content={() => null}), and Recharts colors tooltip entries from
              each series' stroke/fill prop. Task 5 removed those props in favor of
              CSS classes, which do nothing for an HTML tooltip, so the three
              series here get their color back via SERIES_VAR — a var() string
              read positionally by Recharts' own JS, not off the DOM, so it always
              resolves regardless of how var() behaves as an SVG attribute. The
              className still does the actual SVG painting. */}
          <Tooltip />
          <Bar yAxisId="precip" dataKey="precip" name="Precip (mm)" className={SERIES.precip} fill={SERIES_VAR.precip}>
            {data.map((d, i) => (
              <Cell key={i} fillOpacity={d.partial ? 0.45 : 1} />
            ))}
          </Bar>
          <Line yAxisId="temp" dataKey="high" name="High (°C)" className={SERIES.temp} stroke={SERIES_VAR.temp} strokeWidth={2} dot={false} />
          <Line yAxisId="temp" dataKey="low"  name="Low (°C)"  className={SERIES.low}  stroke={SERIES_VAR.low}  strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      {partialDay && (
        <p className="chart-note">
          * {partialDay.date.slice(5)} is today so far — a partial day
          {nowHour !== undefined && `, through ${String(nowHour).padStart(2, "0")}:00`}
        </p>
      )}
    </div>
  );
}
