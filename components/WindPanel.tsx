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

interface WindPanelProps {
  data: { x: string; speed: number; gust: number }[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
}

export function WindPanel({ data, ticks, tickFormatter }: WindPanelProps) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <ComposedChart data={data} margin={{ top: 8, right: 32, bottom: 16, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="x" ticks={ticks} tickFormatter={tickFormatter} />
        <YAxis label={{ value: "m/s", angle: -90, position: "insideLeft" }} />
        <YAxis orientation="right" yAxisId="right-spacer" hide />
        <Tooltip labelFormatter={(v) => String(v).replace("T", " ")} />
        <Legend />
        <Bar dataKey="gust" name="Gust (m/s)" fill="#93c5fd" fillOpacity={0.6} />
        <Line dataKey="speed" name="Speed (m/s)" stroke="#2563eb" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
