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
});
