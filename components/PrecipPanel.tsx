"use client";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeekendBand } from "@/lib/weekendBands";

interface PrecipPanelProps {
  data: { x: string; precip: number; chance: number | null }[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
  weekendBands?: WeekendBand[];
  onHover?: (index: number) => void;
  onLeave?: () => void;
}

export function PrecipPanel({
  data, ticks, tickFormatter, weekendBands, onHover, onLeave,
}: PrecipPanelProps) {
  function hover(label: unknown) {
    if (label === undefined || !onHover) return;
    const idx = data.findIndex(d => d.x === String(label));
    if (idx >= 0) onHover(idx);
  }
  return (
    <ResponsiveContainer width="100%" height={150}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 80, bottom: 16, left: 0 }}
        onMouseMove={(s) => hover(s.activeLabel)}
        onTouchMove={(s) => hover(s.activeLabel)}
        onTouchStart={(s) => hover(s.activeLabel)}
        onMouseLeave={onLeave}
        onTouchEnd={onLeave}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />

        {weekendBands?.map(b => (
          <ReferenceArea key={`weekend-${b.start}`} x1={b.start} x2={b.end} yAxisId="mm"
            fill="#f59e0b" fillOpacity={0.08} stroke="none" />
        ))}

        <XAxis dataKey="x" ticks={ticks} tickFormatter={tickFormatter} />
        <YAxis yAxisId="mm" orientation="left" label={{ value: "mm", angle: -90, position: "insideLeft" }} />
        <YAxis yAxisId="pct" orientation="right" width={48} domain={[0, 100]}
          label={{ value: "%", angle: 90, position: "insideRight" }} />
        <Legend />
        <Tooltip content={() => null} />

        <Bar yAxisId="mm" dataKey="precip" name="Precip (mm)" fill="#60a5fa" />
        <Line yAxisId="pct" dataKey="chance" name="Chance (%)" stroke="#2563eb"
          strokeWidth={2} dot={false} connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
