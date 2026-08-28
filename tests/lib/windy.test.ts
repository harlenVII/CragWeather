import { describe, it, expect } from "vitest";
import { windyUrl } from "@/lib/windy";

describe("windyUrl", () => {
  it("builds a windy.com path from lat/lng rounded to 3 decimals", () => {
    expect(windyUrl(47.55425, -121.54968)).toBe("https://www.windy.com/47.554/-121.550");
  });

  it("rounds up at the third decimal", () => {
    expect(windyUrl(37.7396, 119.6396)).toBe("https://www.windy.com/37.740/119.640");
  });

  it("keeps the sign when rounding a negative coordinate", () => {
    expect(windyUrl(-33.86885, -70.12341)).toBe("https://www.windy.com/-33.869/-70.123");
  });

  it("normalizes a negative value that rounds to zero", () => {
    expect(windyUrl(-0.0004, -0.0004)).toBe("https://www.windy.com/0.000/0.000");
  });

  it("pads whole-number coordinates to 3 decimals", () => {
    expect(windyUrl(45, -120)).toBe("https://www.windy.com/45.000/-120.000");
  });
});
