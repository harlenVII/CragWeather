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
import type { HourlyWeather } from "@/lib/weather";

export function ForecastChart({ hourly }: { hourly: HourlyWeather[] }) {
  const data = hourly.map(h => ({
    datetime: h.datetime,
    temp: Math.round(h.temp),
    precip: h.precip,
  }));

  const dayTicks = data
    .filter(d => d.datetime.slice(11) === "00:00")
    .map(d => d.datetime);

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 16, right: 32, bottom: 16, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis
            dataKey="datetime"
            ticks={dayTicks}
            tickFormatter={(v: string) => v.slice(5, 10)}
          />
          <YAxis yAxisId="precip" orientation="left" label={{ value: "mm", angle: -90, position: "insideLeft" }} />
          <YAxis yAxisId="temp" orientation="right" label={{ value: "°C", angle: 90, position: "insideRight" }} />
          <Tooltip labelFormatter={(v: string) => v.replace("T", " ")} />
          <Legend />
          <Bar yAxisId="precip" dataKey="precip" name="Precip (mm)" fill="#60a5fa" />
          <Line yAxisId="temp" dataKey="temp" name="Temp (°C)" stroke="#dc2626" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
