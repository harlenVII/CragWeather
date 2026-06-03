import { describe, it, expect } from "vitest";
import { validateRoutesBody } from "@/lib/list-validation";

describe("validateRoutesBody", () => {
  const good = { id: 1, name: "The Nose", area: "Yosemite", grade: "5.9" };

  it("accepts a valid routes array", () => {
    expect(validateRoutesBody({ routes: [good] })).toEqual([good]);
  });

  it("accepts an empty routes array", () => {
    expect(validateRoutesBody({ routes: [] })).toEqual([]);
  });

  it("accepts area and grade as null", () => {
    expect(validateRoutesBody({ routes: [{ id: 1, name: "x", area: null, grade: null }] }))
      .toEqual([{ id: 1, name: "x", area: null, grade: null }]);
  });

  it("rejects non-object body", () => {
    expect(validateRoutesBody(null)).toBeNull();
    expect(validateRoutesBody("nope")).toBeNull();
  });

  it("rejects missing routes field", () => {
    expect(validateRoutesBody({})).toBeNull();
  });

  it("rejects non-array routes", () => {
    expect(validateRoutesBody({ routes: "x" })).toBeNull();
  });

  it("rejects more than 50 routes", () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ ...good, id: i }));
    expect(validateRoutesBody({ routes: many })).toBeNull();
  });

  it("rejects item with non-number id", () => {
    expect(validateRoutesBody({ routes: [{ ...good, id: "1" }] })).toBeNull();
  });

  it("rejects item with non-string name", () => {
    expect(validateRoutesBody({ routes: [{ ...good, name: 123 }] })).toBeNull();
  });

  it("rejects item with non-string non-null area", () => {
    expect(validateRoutesBody({ routes: [{ ...good, area: 123 }] })).toBeNull();
  });

  const gps = { kind: "gps", lat: 37.734, lng: -119.637, name: "Secret boulder" };

  it("accepts a valid GPS route", () => {
    expect(validateRoutesBody({ routes: [gps] })).toEqual([gps]);
  });

  it("accepts a mixed MP + GPS array", () => {
    expect(validateRoutesBody({ routes: [good, gps] })).toEqual([good, gps]);
  });

  it("rejects a GPS route with non-number lat", () => {
    expect(validateRoutesBody({ routes: [{ ...gps, lat: "37" }] })).toBeNull();
  });

  it("rejects a GPS route with out-of-range lng", () => {
    expect(validateRoutesBody({ routes: [{ ...gps, lng: 181 }] })).toBeNull();
  });

  it("rejects a GPS route with non-string name", () => {
    expect(validateRoutesBody({ routes: [{ ...gps, name: 5 }] })).toBeNull();
  });

  const long = "x".repeat(201);

  it("rejects an MP route with an over-long name", () => {
    expect(validateRoutesBody({ routes: [{ ...good, name: long }] })).toBeNull();
  });

  it("rejects an MP route with an over-long area", () => {
    expect(validateRoutesBody({ routes: [{ ...good, area: long }] })).toBeNull();
  });

  it("rejects an MP route with an over-long grade", () => {
    expect(validateRoutesBody({ routes: [{ ...good, grade: long }] })).toBeNull();
  });

  it("rejects a GPS route with an over-long name", () => {
    expect(validateRoutesBody({ routes: [{ ...gps, name: long }] })).toBeNull();
  });

  it("accepts a name exactly at the 200-char limit", () => {
    const ok = "y".repeat(200);
    expect(validateRoutesBody({ routes: [{ ...good, name: ok }] })).toEqual([{ ...good, name: ok }]);
  });
});
