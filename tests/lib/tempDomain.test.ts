import { describe, expect, it } from "vitest";
import { MIN_SPAN_C, PAD_C, tempDomain } from "@/lib/tempDomain";

describe("tempDomain", () => {
  it("pads a normal range and does not anchor to zero", () => {
    // The whole point: Recharts' default (and its 'auto') snap the lower bound to
    // 0 for all-positive data, wasting a third of the panel on temperatures that
    // never occur. Temperature is an interval scale — zero is not a baseline.
    const [min, max] = tempDomain([7, 15, 29, 12]);
    expect(min).toBe(7 - PAD_C);
    expect(max).toBe(29 + PAD_C);
    expect(min).toBeGreaterThan(0);
  });

  it("widens a flat range to the minimum span, centred on the data", () => {
    // A 12–14°C day auto-fitted would fill the panel and read as a big swing.
    const [min, max] = tempDomain([12, 13, 14]);
    expect(max - min).toBe(MIN_SPAN_C);
    // centred: the data's midpoint (13) stays in the middle
    expect((min + max) / 2).toBe(13);
  });

  it("leaves a range already wider than the minimum span alone", () => {
    const [min, max] = tempDomain([0, 40]);
    expect(max - min).toBeGreaterThan(MIN_SPAN_C);
    expect(min).toBe(-PAD_C);
    expect(max).toBe(40 + PAD_C);
  });

  it("handles sub-zero temperatures", () => {
    // Winter climbing: the old [0, auto] default made negatives awkward.
    const [min, max] = tempDomain([-12, -3]);
    expect(min).toBeLessThan(-12);
    expect(max).toBeGreaterThan(-3);
    expect(max - min).toBeGreaterThanOrEqual(MIN_SPAN_C);
  });

  it("returns whole degrees so ticks stay readable", () => {
    const [min, max] = tempDomain([7.4, 21.6]);
    expect(Number.isInteger(min)).toBe(true);
    expect(Number.isInteger(max)).toBe(true);
  });

  it("survives an empty series without producing Infinity", () => {
    // Math.min() of nothing is Infinity, which would blank the whole chart.
    const [min, max] = tempDomain([]);
    expect(Number.isFinite(min)).toBe(true);
    expect(Number.isFinite(max)).toBe(true);
    expect(max).toBeGreaterThan(min);
  });

  it("ignores non-finite values rather than poisoning the domain", () => {
    const [min, max] = tempDomain([10, NaN, 20]);
    expect(Number.isFinite(min)).toBe(true);
    expect(Number.isFinite(max)).toBe(true);
    expect(min).toBe(10 - PAD_C);
    expect(max).toBe(20 + PAD_C);
  });
});
