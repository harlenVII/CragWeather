import { describe, it, expect } from "vitest";
import { parseSearchTarget } from "@/lib/searchTarget";

describe("parseSearchTarget", () => {
  it("classifies a Mountain Project route URL", () => {
    expect(parseSearchTarget("https://www.mountainproject.com/route/105748662/the-nose"))
      .toEqual({ kind: "mp", id: "105748662" });
  });
  it("classifies a mangled MP URL (missing scheme slash)", () => {
    expect(parseSearchTarget("mountainproject.com/route/201226065/x"))
      .toEqual({ kind: "mp", id: "201226065" });
  });
  it("classifies a Mountain Project /v/ short URL as mp-short (needs resolution)", () => {
    expect(parseSearchTarget("https://www.mountainproject.com/v/201226065"))
      .toEqual({ kind: "mp-short", id: "201226065" });
  });
  it("classifies a map URL as coords with source url", () => {
    expect(parseSearchTarget("https://www.google.com/maps/@37.734,-119.637,15z"))
      .toEqual({ kind: "coords", lat: 37.734, lng: -119.637, source: "url" });
  });
  it("classifies raw decimal coords with source raw", () => {
    expect(parseSearchTarget("37.734, -119.637"))
      .toEqual({ kind: "coords", lat: 37.734, lng: -119.637, source: "raw" });
  });
  it("returns null for plain text", () => {
    expect(parseSearchTarget("the nose")).toBeNull();
  });
});
