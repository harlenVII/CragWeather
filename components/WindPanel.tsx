"use client";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

interface WindPanelProps {
  data: { x: string; speed: number; gust: number }[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
  onHover?: (index: number) => void;
  onLeave?: () => void;
}

export function WindPanel({ data, ticks, tickFormatter, onHover, onLeave }: WindPanelProps) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 80, bottom: 16, left: 0 }}
        onMouseMove={(state) => {
          const idx = state.activeTooltipIndex;
          if (typeof idx === "number" && onHover) onHover(idx);
        }}
        onMouseLeave={onLeave}
        onTouchEnd={onLeave}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="x" ticks={ticks} tickFormatter={tickFormatter} />
        <YAxis label={{ value: "m/s", angle: -90, position: "insideLeft" }} />
        <Legend />
        <Bar dataKey="gust" name="Gust (m/s)" fill="#6ee7b7" fillOpacity={0.6} />
        <Line dataKey="speed" name="Speed (m/s)" stroke="#059669" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
