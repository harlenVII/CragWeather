import { describe, it, expect } from "vitest";
import { parseCoords, formatCoords, coordsPath } from "@/lib/parseCoords";

describe("parseCoords — decimal pairs", () => {
  it("parses comma-separated signed decimals (source raw)", () => {
    expect(parseCoords("37.734, -119.637")).toEqual({ lat: 37.734, lng: -119.637, source: "raw" });
  });
  it("parses space-separated decimals", () => {
    expect(parseCoords("37.734 -119.637")).toEqual({ lat: 37.734, lng: -119.637, source: "raw" });
  });
  it("parses hemisphere letters and applies sign", () => {
    expect(parseCoords("37.734 N, 119.637 W")).toEqual({ lat: 37.734, lng: -119.637, source: "raw" });
  });
  it("reorders by hemisphere when longitude is given first", () => {
    expect(parseCoords("119.637 W, 37.734 N")).toEqual({ lat: 37.734, lng: -119.637, source: "raw" });
  });
  it("handles a southern/eastern point", () => {
    expect(parseCoords("-33.8688, 151.2093")).toEqual({ lat: -33.8688, lng: 151.2093, source: "raw" });
  });
});

describe("parseCoords — DMS", () => {
  it("parses degrees-minutes-seconds with hemispheres", () => {
    const r = parseCoords(`37°44'02"N 119°38'13"W`)!;
    expect(r.source).toBe("raw");
    expect(r.lat).toBeCloseTo(37.7339, 3);
    expect(r.lng).toBeCloseTo(-119.6369, 3);
  });
  it("parses DMS without seconds", () => {
    const r = parseCoords(`37°44'N 119°38'W`)!;
    expect(r.lat).toBeCloseTo(37.7333, 3);
    expect(r.lng).toBeCloseTo(-119.6333, 3);
  });
});

describe("parseCoords — map URLs (source url)", () => {
  it("parses Google @lat,lng", () => {
    expect(parseCoords("https://www.google.com/maps/@37.734,-119.637,15z"))
      .toEqual({ lat: 37.734, lng: -119.637, source: "url" });
  });
  it("parses Google !3d!4d", () => {
    expect(parseCoords("https://www.google.com/maps/place/X/data=!3d37.734!4d-119.637"))
      .toEqual({ lat: 37.734, lng: -119.637, source: "url" });
  });
  it("parses ?q=lat,lng", () => {
    expect(parseCoords("https://maps.google.com/?q=37.734,-119.637"))
      .toEqual({ lat: 37.734, lng: -119.637, source: "url" });
  });
  it("parses Apple ?ll=lat,lng", () => {
    expect(parseCoords("https://maps.apple.com/?ll=37.734,-119.637&z=15"))
      .toEqual({ lat: 37.734, lng: -119.637, source: "url" });
  });
  it("parses ?q= with percent-encoded comma (%2C)", () => {
    expect(parseCoords("https://maps.google.com/?q=37.734%2C-119.637"))
      .toEqual({ lat: 37.734, lng: -119.637, source: "url" });
  });
});

describe("parseCoords — rejections", () => {
  it("returns null for plain text", () => {
    expect(parseCoords("the nose")).toBeNull();
  });
  it("returns null for out-of-range latitude", () => {
    expect(parseCoords("91, 10")).toBeNull();
  });
  it("returns null for out-of-range longitude", () => {
    expect(parseCoords("10, 181")).toBeNull();
  });
  it("returns null for a single number", () => {
    expect(parseCoords("37.734")).toBeNull();
  });
  it("returns null for empty input", () => {
    expect(parseCoords("   ")).toBeNull();
  });
  it("returns null for shortened map links", () => {
    expect(parseCoords("https://maps.app.goo.gl/abc123")).toBeNull();
  });
});

describe("formatCoords / coordsPath", () => {
  it("formatCoords rounds to 4 decimals with comma+space", () => {
    expect(formatCoords(37.73395, -119.63699)).toBe("37.7340, -119.6370");
  });
  it("coordsPath rounds to 4 decimals with no space", () => {
    expect(coordsPath(37.73395, -119.63699)).toBe("37.7340,-119.6370");
  });
});
