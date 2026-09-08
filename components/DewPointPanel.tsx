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

interface DewPointPanelProps {
  data: { x: string; temp: number; dewPoint: number }[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
  weekendBands?: WeekendBand[];
  onHover?: (index: number) => void;
  onLeave?: () => void;
}

function DewPointPanelImpl({
  data, ticks, tickFormatter, weekendBands, onHover, onLeave,
}: DewPointPanelProps) {
  function hover(label: unknown) {
    if (label === undefined || !onHover) return;
    const idx = data.findIndex(d => d.x === String(label));
    if (idx >= 0) onHover(idx);
  }
  return (
    // No right-hand axis here, so margin.right must be 80 to match TempPanel,
    // HumidityPanel and WindPanel. PrecipPanel uses 32 only because its 48px
    // right axis makes up the same total — Recharts insets the plot by
    // margin.right PLUS any right-oriented axis width. Getting this wrong
    // silently drifts this panel out of register with the rest of the stack;
    // tests/components/panelAlignment.test.tsx guards it.
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
        <YAxis domain={tempDomain([...data.map(d => d.temp), ...data.map(d => d.dewPoint)])} label={{ value: "°C", angle: -90, position: "insideLeft" }} />
        <Legend />
        <Tooltip content={() => null} />

        {/* One shared °C axis: the vertical gap between these two lines is the
            reading — when they converge, the rock is at risk of condensation. */}
        <Line dataKey="dewPoint" name="Dew point (°C)" stroke="#0f766e" strokeWidth={2} dot={false} />
        <Line dataKey="temp"     name="Temp (°C)"      stroke="#dc2626" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export const DewPointPanel = memo(DewPointPanelImpl);
