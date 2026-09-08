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

interface HumidityPanelProps {
  data: { x: string; humidity: number }[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
  weekendBands?: WeekendBand[];
  onHover?: (index: number) => void;
  onLeave?: () => void;
}

function HumidityPanelImpl({
  data, ticks, tickFormatter, weekendBands, onHover, onLeave,
}: HumidityPanelProps) {
  function hover(label: unknown) {
    if (label === undefined || !onHover) return;
    const idx = data.findIndex(d => d.x === String(label));
    if (idx >= 0) onHover(idx);
  }
  return (
    <ResponsiveContainer width="100%" height={150}>
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

        {weekendBands?.map(b => (
          <ReferenceArea key={`weekend-${b.start}`} x1={b.start} x2={b.end}
            fill="#f59e0b" fillOpacity={0.08} stroke="none" />
        ))}

        <XAxis dataKey="x" ticks={ticks} tickFormatter={tickFormatter} />
        <YAxis domain={[0, 100]} label={{ value: "%", angle: -90, position: "insideLeft" }} />
        <Legend />
        <Tooltip content={() => null} />

        <Line dataKey="humidity" name="Humidity (%)" stroke="#0891b2" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export const HumidityPanel = memo(HumidityPanelImpl);
