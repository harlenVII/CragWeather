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
import { LEFT_MARGIN } from "@/lib/panelLayout";
import { aqiDomain, nullRuns, visibleBands } from "@/lib/aqiBands";

// No `weekendBands` prop, and that is deliberate — this is the one panel in the
// stack that does not take one. The weekend band is amber (#f59e0b), which on an
// AQI chart is the colour of "Unhealthy for sensitive groups": a reader scanning
// the amber Saturday column could read it as pollution. That is a semantic
// collision, not merely a muddy overlap, and it is worse than the amber-on-amber
// problem DewPointPanel dodged by switching to sky/rose. The weekend cue is still
// carried by the five panels directly above, on the same x-axis. Accepting the
// prop and ignoring it would be worse than omitting it: a caller would pass it
// and wonder why nothing rendered.
interface AirQualityPanelProps {
  data: { x: string; aqi: number | null }[];
  ticks?: string[];
  tickFormatter?: (v: string) => string;
  onHover?: (index: number) => void;
  onLeave?: () => void;
}

function AirQualityPanelImpl({
  data, ticks, tickFormatter, onHover, onLeave,
}: AirQualityPanelProps) {
  function hover(label: unknown) {
    if (label === undefined || !onHover) return;
    const idx = data.findIndex(d => d.x === String(label));
    if (idx >= 0) onHover(idx);
  }

  const values = data.map(d => d.aqi);
  const [lo, hi] = aqiDomain(values);
  const bands = visibleBands(hi);

  // CAMS itself returns a contiguous prefix then a clean null tail, but the
  // series this panel draws is a *join* against the weather hours (see
  // ForecastChart) keyed by two different clocks — the AQ fetch uses the
  // crag-local date, the weather slice uses the viewer's browser-clock date.
  // When the crag is a day ahead of the viewer, the joined series opens with a
  // null run too. nullRuns finds every maximal null run regardless of where it
  // falls, so the shading stays honest without leaning on that invariant.
  const deadRuns = nullRuns(values);

  return (
    // No right-hand axis, so margin.right must be 80 to match TempPanel,
    // WindPanel, DewPointPanel and HumidityPanel. Recharts insets the plot by
    // margin.right PLUS any right-oriented axis width, which is why PrecipPanel
    // uses 32 against its 48px axis. Getting this wrong silently drifts the panel
    // out of register with the stack; panelAlignment.test.tsx guards it.
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
        {/* EPA category bands, emitted first so they paint behind everything —
            SVG has no z-index, so a band declared after the line would tint the
            series the reader is trying to trace. Only the bands the axis
            actually reaches are drawn, so a clean crag is a calm two-tone panel
            and a smoke event lights the upper bands up. */}
        {bands.map(b => (
          <ReferenceArea key={`aqi-${b.min}`} y1={b.min} y2={b.max}
            fill={b.fill} fillOpacity={0.1} stroke="none" />
        ))}

        {/* The hours CAMS does not forecast — leading, interior or trailing.
            Stated rather than left as an ambiguous blank — the same instinct as
            the history chart's partial-day marker. One band per run; the
            trailing-run caption is rendered by ForecastChart. */}
        {deadRuns.map(run => (
          <ReferenceArea key={`dead-${run.start}`} x1={data[run.start].x} x2={data[run.end].x}
            fill="#6b7280" fillOpacity={0.12} stroke="none" />
        ))}

        <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />

        <XAxis dataKey="x" ticks={ticks} tickFormatter={tickFormatter} />
        <YAxis domain={[lo, hi]} label={{ value: "AQI", angle: -90, position: "insideLeft" }} />
        <Legend />
        <Tooltip content={() => null} />

        {/* Dark neutral so the line stays readable over the coloured bands.
            connectNulls={false} is the entire gap-handling requirement: the
            nulls are a clean trailing tail with no interior gaps. */}
        <Line dataKey="aqi" name="US AQI" stroke="#3f3f46" strokeWidth={2}
          dot={false} connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export const AirQualityPanel = memo(AirQualityPanelImpl);
