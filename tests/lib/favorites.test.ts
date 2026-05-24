import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { vi } from "vitest";
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

function mockFetchOk(body: unknown) {
  return vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
}

describe("useFavorites linked mode", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("listId is null when cw_list_id is not set", () => {
    const { result } = renderHook(() => useFavorites());
    expect(result.current.listId).toBeNull();
  });

  it("reads cw_list_id from localStorage on mount", () => {
    localStorage.setItem("cw_list_id", "00000000-0000-0000-0000-000000000001");
    mockFetchOk({ routes: [] });
    const { result } = renderHook(() => useFavorites());
    expect(result.current.listId).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("fetches from server on mount when linked and replaces local state", async () => {
    localStorage.setItem("cw_list_id", "00000000-0000-0000-0000-000000000001");
    localStorage.setItem("cw_favorites", JSON.stringify([r1])); // stale local
    const fetchSpy = mockFetchOk({ routes: [r2] });

    const { result } = renderHook(() => useFavorites());

    await waitFor(() => expect(result.current.favorites).toEqual([r2]));
    expect(fetchSpy).toHaveBeenCalledWith("/api/list/00000000-0000-0000-0000-000000000001");
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual([r2]);
  });

  it("PUTs to server on toggle when linked", async () => {
    localStorage.setItem("cw_list_id", "00000000-0000-0000-0000-000000000001");
    const fetchSpy = mockFetchOk({ routes: [] });

    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled()); // initial GET

    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    act(() => { result.current.toggle(r1); });

    await waitFor(() => {
      const putCall = fetchSpy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "PUT");
      expect(putCall).toBeDefined();
      expect(putCall![0]).toBe("/api/list/00000000-0000-0000-0000-000000000001");
      expect(JSON.parse((putCall![1] as RequestInit).body as string)).toEqual({ routes: [r1] });
    });
  });

  it("does not call fetch on toggle when not linked", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("PUT failure does not break local write", async () => {
    localStorage.setItem("cw_list_id", "00000000-0000-0000-0000-000000000001");
    const fetchSpy = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ routes: [] }), { status: 200 }))
      .mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    act(() => { result.current.toggle(r1); });
    expect(result.current.favorites).toEqual([r1]);
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual([r1]);
  });

  it("createSyncedList POSTs current favorites and sets cw_list_id", async () => {
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.toggle(r1); });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "00000000-0000-0000-0000-000000000002" }), { status: 200 }),
    );

    let returnedId: string | null = null;
    await act(async () => {
      returnedId = await result.current.createSyncedList();
    });

    expect(returnedId).toBe("00000000-0000-0000-0000-000000000002");
    expect(result.current.listId).toBe("00000000-0000-0000-0000-000000000002");
    expect(localStorage.getItem("cw_list_id")).toBe("00000000-0000-0000-0000-000000000002");

    const postCall = fetchSpy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST");
    expect(postCall).toBeDefined();
    expect(postCall![0]).toBe("/api/list");
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toEqual({ routes: [r1] });
  });

  it("link(id, routes) sets cw_list_id and replaces favorites", () => {
    const { result } = renderHook(() => useFavorites());
    act(() => {
      result.current.link("00000000-0000-0000-0000-000000000003", [r2]);
    });
    expect(result.current.listId).toBe("00000000-0000-0000-0000-000000000003");
    expect(result.current.favorites).toEqual([r2]);
    expect(localStorage.getItem("cw_list_id")).toBe("00000000-0000-0000-0000-000000000003");
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual([r2]);
  });

  it("unlink clears cw_list_id and keeps local favorites", () => {
    localStorage.setItem("cw_list_id", "00000000-0000-0000-0000-000000000004");
    mockFetchOk({ routes: [r1] });
    const { result } = renderHook(() => useFavorites());
    act(() => { result.current.unlink(); });
    expect(result.current.listId).toBeNull();
    expect(localStorage.getItem("cw_list_id")).toBeNull();
    expect(result.current.favorites).toEqual([r1]);
  });
});
