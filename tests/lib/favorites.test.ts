import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFavorites, type SavedRoute } from "@/lib/favorites";

const r1: SavedRoute = { id: 1, name: "The Nose", area: "Yosemite", grade: "5.14" };
const r2: SavedRoute = { id: 2, name: "Astroman", area: "Yosemite", grade: "5.11c" };

describe("useFavorites", () => {
  beforeEach(() => localStorage.clear());

  it("starts empty when localStorage is empty", () => {
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites).toEqual([]);
  });

  it("adds a route via toggle", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    expect(result.current.favorites).toEqual([r1]);
  });

  it("removes a route via toggle when already saved", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    act(() => { result.current.toggle(r1); });
    expect(result.current.favorites).toEqual([]);
  });

  it("inserts newest-first", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    act(() => { result.current.toggle(r2); });
    expect(result.current.favorites[0]).toEqual(r2);
    expect(result.current.favorites[1]).toEqual(r1);
  });

  it("isSaved returns true for a saved route and false for others", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    expect(result.current.isSaved(1)).toBe(true);
    expect(result.current.isSaved(2)).toBe(false);
  });

  it("remove removes by id", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    act(() => { result.current.toggle(r2); });
    act(() => { result.current.remove(1); });
    expect(result.current.favorites).toEqual([r2]);
  });

  it("persists to localStorage after toggle", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual([r1]);
  });

  it("reads existing favorites from localStorage on mount", () => {
    localStorage.setItem("cw_favorites", JSON.stringify([r1]));
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites).toEqual([r1]);
  });

  it("recovers from malformed JSON in localStorage", () => {
    localStorage.setItem("cw_favorites", "not-json{{{");
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites).toEqual([]);
    expect(localStorage.getItem("cw_favorites")).toBe("[]");
  });

  it("caps favorites at 50 entries", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => {
      for (let i = 0; i < 55; i++) {
        result.current.toggle({ id: i, name: `Route ${i}`, area: null, grade: null });
      }
    });
    expect(result.current.favorites.length).toBe(50);
  });
});
