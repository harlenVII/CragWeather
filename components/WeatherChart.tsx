"use client";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyWeather } from "@/lib/weather";

export function WeatherChart({ daily }: { daily: DailyWeather[] }) {
  const data = daily.map((d) => ({
    date: d.date.slice(5),  // MM-DD
    high: d.tempMax,
    low: d.tempMin,
    precip: d.precip,
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
          <Bar yAxisId="precip" dataKey="precip" name="Precip (mm)" fill="#60a5fa" />
          <Line yAxisId="temp" dataKey="high" name="High (°C)" stroke="#dc2626" strokeWidth={2} dot={false} />
          <Line yAxisId="temp" dataKey="low"  name="Low (°C)"  stroke="#2563eb" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
