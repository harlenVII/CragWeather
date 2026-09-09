"use client";
import { memo } from "react";
import {
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
import { LEFT_MARGIN } from "@/lib/panelLayout";
import { tempDomain } from "@/lib/tempDomain";

interface TempPanelProps {
  data: { x: string; temp: number; feelsLike: number }[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
  weekendBands?: WeekendBand[];
  nightBands?: WeekendBand[];
  onHover?: (index: number) => void;
  onLeave?: () => void;
}

function TempPanelImpl({
  data, ticks, tickFormatter, weekendBands, nightBands, onHover, onLeave,
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
        margin={{ top: 8, right: 80, bottom: 16, left: LEFT_MARGIN }}
        onMouseMove={(s) => hover(s.activeLabel)}
        onTouchMove={(s) => hover(s.activeLabel)}
        onTouchStart={(s) => hover(s.activeLabel)}
        onMouseLeave={onLeave}
        onTouchEnd={onLeave}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />

        {/* Night before weekend: the two tints multiply where they overlap, and
            the darker one reads better underneath. Both are emitted ahead of the
            series — SVG has no z-index, so a band declared later would tint the
            line being traced. */}
        {nightBands?.map(b => (
          <ReferenceArea key={`night-${b.start}`} x1={b.start} x2={b.end}
            fill="#475569" fillOpacity={0.07} stroke="none" />
        ))}

        {weekendBands?.map(b => (
          <ReferenceArea key={`weekend-${b.start}`} x1={b.start} x2={b.end}
            fill="#f59e0b" fillOpacity={0.08} stroke="none" />
        ))}

        <XAxis dataKey="x" ticks={ticks} tickFormatter={tickFormatter} />
        <YAxis domain={tempDomain([...data.map(d => d.temp), ...data.map(d => d.feelsLike)])} label={{ value: "°C", angle: -90, position: "insideLeft" }} />
        <Legend />
        <Tooltip content={() => null} />

        <Line dataKey="feelsLike" name="Feels like (°C)" stroke="#f87171" strokeWidth={2}   strokeDasharray="5 3" dot={false} />
        <Line dataKey="temp"      name="Temp (°C)"       stroke="#dc2626" strokeWidth={2}   dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export const TempPanel = memo(TempPanelImpl);
