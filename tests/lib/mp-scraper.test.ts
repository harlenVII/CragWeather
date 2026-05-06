import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRoutePage } from "@/lib/mp-scraper";

const fixture = (id: number) =>
  readFileSync(join(__dirname, "..", "fixtures", "mp", `${id}.html`), "utf8");

describe("parseRoutePage — name + coords", () => {
  it("extracts The Nose", () => {
    const r = parseRoutePage(fixture(105924807));
    expect(r.name).toBe("The Nose");
    expect(r.lat).toBeCloseTo(37.73, 1);
    expect(r.lng).toBeCloseTo(-119.64, 1);
  });

  it("extracts The Naked Edge", () => {
    const r = parseRoutePage(fixture(105748786));
    expect(r.name).toBe("The Naked Edge");
    expect(r.lat).toBeGreaterThan(39);
    expect(r.lat).toBeLessThan(40);
    expect(r.lng).toBeLessThan(-105);
    expect(r.lng).toBeGreaterThan(-106);
  });

  it("extracts High Exposure", () => {
    const r = parseRoutePage(fixture(105748131));
    expect(r.name).toBe("High Exposure");
    expect(r.lat).toBeGreaterThan(39);
    expect(r.lat).toBeLessThan(41);
    expect(r.lng).toBeLessThan(-105);
    expect(r.lng).toBeGreaterThan(-106);
  });
});

describe("parseRoutePage — area path", () => {
  it("includes deep nested area for The Nose", () => {
    const r = parseRoutePage(fixture(105924807));
    expect(r.area).toMatch(/El Capitan/i);
    expect(r.area).toMatch(/Yosemite/i);
    expect(r.area!.split(" > ").length).toBeGreaterThanOrEqual(2);
  });

  it("includes area for The Naked Edge", () => {
    const r = parseRoutePage(fixture(105748786));
    expect(r.area).toMatch(/Eldorado|Colorado/i);
  });
});
