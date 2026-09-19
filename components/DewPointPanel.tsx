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
import { GOOD_MAX_C, GREASY_MIN_C } from "@/lib/dewPointBands";
import { dewPointDomain } from "@/lib/tempDomain";
import { BANDS, SERIES } from "@/lib/chartColors";

interface DewPointPanelProps {
  data: { x: string; dewPoint: number }[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
  weekendBands?: WeekendBand[];
  nightBands?: WeekendBand[];
  onHover?: (index: number) => void;
  onLeave?: () => void;
}

const BAND_LABEL = { fontSize: 10 };

function DewPointPanelImpl({
  data, ticks, tickFormatter, weekendBands, nightBands, onHover, onLeave,
}: DewPointPanelProps) {
  function hover(label: unknown) {
    if (label === undefined || !onHover) return;
    const idx = data.findIndex(d => d.x === String(label));
    if (idx >= 0) onHover(idx);
  }

  // Computed once and used for both the axis and the band bounds, so the bands
  // are pinned to real domain edges. Passing ±Infinity instead would leave them
  // at the mercy of Recharts' `ifOverflow` handling, whose default for a
  // ReferenceArea is to discard the whole area rather than clip it.
  const [lo, hi] = dewPointDomain(data.map(d => d.dewPoint));

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
        {/* Friction thresholds, emitted first so they paint behind everything —
            SVG has no z-index, so a band declared after the line would tint the
            series the reader is trying to trace. Sky and rose rather than the
            weekend band's amber: two amber tints crossing at right angles read
            as one shape. */}
        <ReferenceArea y1={lo} y2={GOOD_MAX_C} className={BANDS.dewGood} stroke="none"
          label={{ value: "good friction", position: "insideBottomLeft", ...BAND_LABEL }} />
        <ReferenceArea y1={GREASY_MIN_C} y2={hi} className={BANDS.dewGreasy} stroke="none"
          label={{ value: "greasy", position: "insideTopLeft", ...BAND_LABEL }} />

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
        <YAxis domain={[lo, hi]} label={{ value: "°C", angle: -90, position: "insideLeft" }} />
        <Legend />
        <Tooltip content={() => null} />

        {/* Dew point alone. Temperature used to be repeated here so the gap
            between the lines could be read as a condensation signal, but that
            reading does not hold: rock wets when its own surface falls below the
            dew point, which is routinely true of cold rock under warm humid air
            — air temperature far above the dew point and the holds still damp.
            The absolute value against these bands is the claim the data supports. */}
        <Line dataKey="dewPoint" name="Dew point (°C)" className={SERIES.dewPoint} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export const DewPointPanel = memo(DewPointPanelImpl);
