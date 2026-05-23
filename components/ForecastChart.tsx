"use client";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HourlyWeather } from "@/lib/weather";
import { WindPanel } from "@/components/WindPanel";

type Section = { model: string; start: string; end: string };

function buildSections(hourly: HourlyWeather[]): Section[] {
  const sections: Section[] = [];
  for (const h of hourly) {
    if (!h.model) continue;
    const last = sections.at(-1);
    if (!last || last.model !== h.model) {
      sections.push({ model: h.model, start: h.datetime, end: h.datetime });
    } else {
      last.end = h.datetime;
    }
  }
  return sections;
}

export function ForecastChart({ hourly }: { hourly: HourlyWeather[] }) {
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

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 24, right: 32, bottom: 16, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis
            dataKey="datetime"
            ticks={dayTicks}
            tickFormatter={(v: string) => v.slice(5, 10)}
          />
          <YAxis yAxisId="precip" orientation="left" label={{ value: "mm", angle: -90, position: "insideLeft" }} />
          <YAxis yAxisId="temp" orientation="right" label={{ value: "°C", angle: 90, position: "insideRight" }} />
          <Tooltip labelFormatter={(v) => String(v).replace("T", " ")} />
          <Legend />

          {sections.map(s => (
            <ReferenceArea
              key={`area-${s.start}`}
              x1={s.start}
              x2={s.end}
              yAxisId="temp"
              label={{ value: s.model, position: "insideTopLeft", fill: "#6b7280", fontSize: 11, fontWeight: 500 }}
              fillOpacity={0}
              strokeOpacity={0}
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
      />
    </div>
  );
}
