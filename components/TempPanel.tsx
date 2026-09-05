"use client";
import {
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
import type { WeekendBand } from "@/lib/weekendBands";
import type { Section } from "@/lib/modelSections";

interface TempPanelProps {
  data: { x: string; temp: number; feelsLike: number; dewPoint: number }[];
  sections?: Section[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
  weekendBands?: WeekendBand[];
  onHover?: (index: number) => void;
  onLeave?: () => void;
}

export function TempPanel({
  data, sections, ticks, tickFormatter, weekendBands, onHover, onLeave,
}: TempPanelProps) {
  function hover(label: unknown) {
    if (label === undefined || !onHover) return;
    const idx = data.findIndex(d => d.x === String(label));
    if (idx >= 0) onHover(idx);
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart
        data={data}
        margin={{ top: 32, right: 80, bottom: 16, left: 0 }}
        onMouseMove={(s) => hover(s.activeLabel)}
        onTouchMove={(s) => hover(s.activeLabel)}
        onTouchStart={(s) => hover(s.activeLabel)}
        onMouseLeave={onLeave}
        onTouchEnd={onLeave}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />

        {weekendBands?.map(b => (
          <ReferenceArea key={`weekend-${b.start}`} x1={b.start} x2={b.end}
            fill="#f59e0b" fillOpacity={0.08} stroke="none" />
        ))}

        <XAxis dataKey="x" ticks={ticks} tickFormatter={tickFormatter} />
        <YAxis label={{ value: "°C", angle: -90, position: "insideLeft" }} />
        <Legend />
        <Tooltip content={() => null} />

        {sections?.map(s => (
          <ReferenceLine key={`label-${s.start}`} x={s.mid} stroke="none"
            label={{ value: s.model, position: "top", fill: "#6b7280", fontSize: 11, fontWeight: 500 }} />
        ))}
        {sections?.slice(1).map(s => (
          <ReferenceLine key={`div-${s.start}`} x={s.start}
            stroke="#d1d5db" strokeDasharray="4 4" strokeWidth={1.5} />
        ))}

        <Line dataKey="dewPoint"  name="Dew point (°C)"  stroke="#6b7280" strokeWidth={1.5} strokeDasharray="2 3" dot={false} />
        <Line dataKey="feelsLike" name="Feels like (°C)" stroke="#f87171" strokeWidth={2}   strokeDasharray="5 3" dot={false} />
        <Line dataKey="temp"      name="Temp (°C)"       stroke="#dc2626" strokeWidth={2}   dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
