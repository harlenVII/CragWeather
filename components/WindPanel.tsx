"use client";
import { memo } from "react";
import {
  Bar,
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

interface WindPanelProps {
  data: { x: string; speed: number; gust: number }[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
  weekendBands?: WeekendBand[];
  nightBands?: WeekendBand[];
  onHover?: (index: number) => void;
  onLeave?: () => void;
}

function WindPanelImpl({ data, ticks, tickFormatter, weekendBands, nightBands, onHover, onLeave }: WindPanelProps) {
  return (
    <ResponsiveContainer width="100%" height={130}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 80, bottom: 16, left: LEFT_MARGIN }}
        onMouseMove={(state) => {
          if (state.activeLabel !== undefined && onHover) {
            const idx = data.findIndex(d => d.x === String(state.activeLabel));
            if (idx >= 0) onHover(idx);
          }
        }}
        onTouchMove={(state) => {
          if (state.activeLabel !== undefined && onHover) {
            const idx = data.findIndex(d => d.x === String(state.activeLabel));
            if (idx >= 0) onHover(idx);
          }
        }}
        onTouchStart={(state) => {
          if (state.activeLabel !== undefined && onHover) {
            const idx = data.findIndex(d => d.x === String(state.activeLabel));
            if (idx >= 0) onHover(idx);
          }
        }}
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
          <ReferenceArea
            key={`weekend-${b.start}`}
            x1={b.start}
            x2={b.end}
            className={BANDS.weekend}
            stroke="none"
          />
        ))}

        <XAxis dataKey="x" ticks={ticks} tickFormatter={tickFormatter} />
        <YAxis label={{ value: "m/s", angle: -90, position: "insideLeft" }} />
        <Tooltip content={() => null} />
        <Bar dataKey="gust" name="Gust (m/s)" className={SERIES.gust} fillOpacity={0.6} />
        <Line dataKey="speed" name="Speed (m/s)" className={SERIES.wind} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export const WindPanel = memo(WindPanelImpl);
