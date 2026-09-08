"use client";
import { memo } from "react";
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

// Rain rates below this share one axis scale rather than each getting stretched
// to fill the panel. Without it the axis auto-fits to whatever the window holds,
// so 0.1mm of drizzle at a dry crag draws a full-height bar that reads as a
// downpour — and the scale silently changes between crags (measured: 1.4mm at
// Yosemite to 52.2mm at Key West) and between the 7/10/15-day windows, since the
// day selector slices the data before it reaches this panel. 4mm/h is the
// "moderate rain" threshold; above it the axis still auto-fits, so genuine
// downpours are never clipped.
const MM_AXIS_FLOOR = 4;

interface PrecipPanelProps {
  data: { x: string; precip: number; chance: number | null }[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
  weekendBands?: WeekendBand[];
  onHover?: (index: number) => void;
  onLeave?: () => void;
}

function PrecipPanelImpl({
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
        margin={{ top: 8, right: 32, bottom: 16, left: 0 }}
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
        <YAxis yAxisId="mm" orientation="left" domain={[0, (dataMax: number) => Math.max(dataMax, MM_AXIS_FLOOR)]} label={{ value: "mm", angle: -90, position: "insideLeft" }} />
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

export const PrecipPanel = memo(PrecipPanelImpl);
