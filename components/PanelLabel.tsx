/**
 * Replaces Recharts' <Legend/>. Six centred legends cost ~25px of chart height
 * each and were the loudest thing in the stack. This is plain DOM above the
 * chart, so it costs no plot area.
 *
 * The `name` strings must stay byte-identical to the old Legend entries —
 * they are a frozen test contract, read via getByText in
 * tests/components/ForecastChart.test.tsx (which asserts every name from
 * every panel renders exactly once, through ForecastChart itself). The
 * individual panel tests (TempPanel, PrecipPanel, DewPointPanel, ...) no
 * longer read these strings at all — they render each chart directly,
 * without ForecastChart's PanelLabel wrapper, and assert curve/bar counts
 * instead.
 *
 * `className` (not `color`): SERIES (lib/chartColors.ts) exports CSS class
 * names, not color strings — Recharts colors its SVG series by class, and this
 * label colors its HTML swatch the same way. `.panel-label__swatch` is a
 * height:0 element drawn entirely by `border-top`, so each `series-*` class
 * needs its own `border-top-color` rule in components.css; the `series-*`
 * rules Task 5 added set `stroke`/`fill`, which do nothing on an HTML element.
 */
export type PanelSeries = { name: string; className: string; dashed?: boolean };

export function PanelLabel({ title, series }: { title: string; series: PanelSeries[] }) {
  return (
    <div className="panel-label">
      <span className="panel-label__title">{title}</span>
      <span className="panel-label__keys">
        {series.map(s => (
          <span key={s.name} className="panel-label__key">
            <span
              aria-hidden="true"
              className={`panel-label__swatch ${s.className}${s.dashed ? " panel-label__swatch--dashed" : ""}`}
            />
            {s.name}
          </span>
        ))}
      </span>
    </div>
  );
}
