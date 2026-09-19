"use client";
import { memo } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeekendBand } from "@/lib/weekendBands";
import { LEFT_MARGIN } from "@/lib/panelLayout";
import { BANDS, SERIES } from "@/lib/chartColors";

interface HumidityPanelProps {
  data: { x: string; humidity: number }[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
  weekendBands?: WeekendBand[];
  nightBands?: WeekendBand[];
  onHover?: (index: number) => void;
  onLeave?: () => void;
}

function HumidityPanelImpl({
  data, ticks, tickFormatter, weekendBands, nightBands, onHover, onLeave,
}: HumidityPanelProps) {
  function hover(label: unknown) {
    if (label === undefined || !onHover) return;
    const idx = data.findIndex(d => d.x === String(label));
    if (idx >= 0) onHover(idx);
  }
  return (
    <ResponsiveContainer width="100%" height={130}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 80, bottom: 16, left: LEFT_MARGIN }}
        onMouseMove={(s) => hover(s.activeLabel)}
        onTouchMove={(s) => hover(s.activeLabel)}
        onTouchStart={(s) => hover(s.activeLabel)}
        onMouseLeave={onLeave}
        onTouchEnd={onLeave}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} />

        {/* Night before weekend: the two tints multiply where they overlap, and
            the darker one reads better underneath. Both are emitted ahead of the
            series — SVG has no z-index, so a band declared later would tint the
            line being traced. */}
        {nightBands?.map(b => (
          <ReferenceArea key={`night-${b.start}`} x1={b.start} x2={b.end}
            className={BANDS.night} stroke="none" />
        ))}

        {weekendBands?.map(b => (
          <ReferenceArea key={`weekend-${b.start}`} x1={b.start} x2={b.end}
            className={BANDS.weekend} stroke="none" />
        ))}

        <XAxis dataKey="x" ticks={ticks} tickFormatter={tickFormatter} />
        <YAxis domain={[0, 100]} label={{ value: "%", angle: -90, position: "insideLeft" }} />
        <Tooltip content={() => null} />

        <Line dataKey="humidity" name="Humidity (%)" className={SERIES.humidity} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export const HumidityPanel = memo(HumidityPanelImpl);
