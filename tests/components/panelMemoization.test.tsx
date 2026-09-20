import { describe, expect, it } from "vitest";
import { TempPanel } from "@/components/TempPanel";
import { PrecipPanel } from "@/components/PrecipPanel";
import { HumidityPanel } from "@/components/HumidityPanel";
import { DewPointPanel } from "@/components/DewPointPanel";
import { WindPanel } from "@/components/WindPanel";
import { AirQualityPanel } from "@/components/AirQualityPanel";

// ForecastChart holds the hover state for the whole stack, so `setActivePoint`
// re-renders it on every mousemove. React re-renders children when the parent
// re-renders regardless of prop identity, so without React.memo on the panels
// every mouse move rebuilds ~2,000 SVG nodes across five charts to update a few
// <span>s in the tooltip strip. Measured on a 15-day window before the fix:
// frame p50 94ms with 58 long tasks per 60 moves; after: 17ms and zero.
//
// jsdom cannot measure frame time, so this guards the structural property the
// fix depends on: unwrapping any of these exports (a tempting "simplification")
// silently reintroduces the jank with no other test failing. The matching half —
// memoised props in ForecastChart — is guarded by
// tests/components/forecastChartProps.test.tsx, which fires a real hover and
// asserts every panel prop keeps its identity across it. Both halves are
// required, since React.memo with unstable props is a no-op.
//
// That half lives in a separate file because it has to mock a panel module, and
// a mocked TempPanel is a plain function — it would fail the React.memo
// assertion below. Do not move it here.
const MEMO = Symbol.for("react.memo");

describe("forecast panel memoization", () => {
  it.each([
    ["TempPanel", TempPanel],
    ["PrecipPanel", PrecipPanel],
    ["HumidityPanel", HumidityPanel],
    ["DewPointPanel", DewPointPanel],
    ["WindPanel", WindPanel],
    ["AirQualityPanel", AirQualityPanel],
  ])("%s is wrapped in React.memo", (_name, Panel) => {
    expect((Panel as unknown as { $$typeof?: symbol }).$$typeof).toBe(MEMO);
  });
});
