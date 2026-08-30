"use client";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyWeather } from "@/lib/weather";

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
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 16, right: 32, bottom: 16, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="date" />
          <YAxis yAxisId="precip" orientation="left" label={{ value: "mm", angle: -90, position: "insideLeft" }} />
          <YAxis yAxisId="temp" orientation="right" label={{ value: "°C", angle: 90, position: "insideRight" }} />
          <Tooltip />
          <Legend />
          <Bar yAxisId="precip" dataKey="precip" name="Precip (mm)" fill="#60a5fa">
            {data.map((d, i) => (
              <Cell key={i} fillOpacity={d.partial ? 0.45 : 1} />
            ))}
          </Bar>
          <Line yAxisId="temp" dataKey="high" name="High (°C)" stroke="#dc2626" strokeWidth={2} dot={false} />
          <Line yAxisId="temp" dataKey="low"  name="Low (°C)"  stroke="#2563eb" strokeWidth={2} dot={false} />
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
