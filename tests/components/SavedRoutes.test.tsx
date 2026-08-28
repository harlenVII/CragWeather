import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SavedRoutes } from "@/components/SavedRoutes";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("SavedRoutes", () => {
  it("renders the section with an empty-state message when there are no favorites", () => {
    render(<SavedRoutes />);
    expect(screen.getByRole("heading", { name: /saved routes/i })).toBeInTheDocument();
    expect(screen.getByText(/no routes saved yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sync to another device/i })).toBeInTheDocument();
  });

  it("renders area and grade for each saved route", () => {
    localStorage.setItem(
      "cw_favorites",
      JSON.stringify([{ id: 1, name: "The Nose", area: "Yosemite > El Cap", grade: "5.9" }]),
    );
    render(<SavedRoutes />);
    expect(screen.getByText("The Nose")).toBeInTheDocument();
    expect(screen.getByText(/Yosemite > El Cap/)).toBeInTheDocument();
    expect(screen.getByText(/5\.9/)).toBeInTheDocument();
  });

  it("renders without area/grade gracefully when null", () => {
    localStorage.setItem(
      "cw_favorites",
      JSON.stringify([{ id: 1, name: "Unnamed", area: null, grade: null }]),
    );
    render(<SavedRoutes />);
    expect(screen.getByText("Unnamed")).toBeInTheDocument();
  });

  it("shows the Synced badge when cw_list_id is set", () => {
    localStorage.setItem("cw_list_id", "abcd1234-0000-0000-0000-000000000001");
    localStorage.setItem("cw_favorites", JSON.stringify([{ id: 1, name: "x", area: null, grade: null }]));
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ routes: [{ id: 1, name: "x", area: null, grade: null }] }), { status: 200 }),
    );
    render(<SavedRoutes />);
    expect(screen.getAllByText(/synced/i).length).toBeGreaterThan(0);
  });

  it("opens the sync modal when the sync button is clicked", async () => {
    localStorage.setItem("cw_favorites", JSON.stringify([{ id: 1, name: "x", area: null, grade: null }]));
    render(<SavedRoutes />);
    await userEvent.click(screen.getByRole("button", { name: /sync to another device/i }));
    expect(screen.getByRole("dialog", { name: /sync saved routes/i })).toBeInTheDocument();
  });

  it("renders a GPS favorite with coordinates and an /at link", () => {
    localStorage.setItem(
      "cw_favorites",
      JSON.stringify([{ kind: "gps", lat: 37.734, lng: -119.637, name: "Secret boulder" }]),
    );
    render(<SavedRoutes />);
    expect(screen.getByText("Secret boulder")).toBeInTheDocument();
    expect(screen.getByText("37.7340, -119.6370")).toBeInTheDocument();
    // Scoped to the card link — the Windy sibling also carries the name in its label.
    expect(screen.getByRole("link", { name: /^secret boulder/i }))
      .toHaveAttribute("href", "/at/37.7340,-119.6370");
  });
});

describe("SavedRoutes — Windy links", () => {
  it("links a saved GPS location to Windy", () => {
    localStorage.setItem(
      "cw_favorites",
      JSON.stringify([{ kind: "gps", lat: 47.55425, lng: -121.54968, name: "Secret boulder" }]),
    );
    render(<SavedRoutes />);
    expect(screen.getByRole("link", { name: /secret boulder on windy/i })).toHaveAttribute(
      "href",
      "https://www.windy.com/47.554/-121.550",
    );
  });

  it("links a saved MP route that already has coordinates", () => {
    localStorage.setItem(
      "cw_favorites",
      JSON.stringify([
        { id: 1, name: "The Nose", area: "Yosemite", grade: "5.9", lat: 47.55425, lng: -121.54968 },
      ]),
    );
    render(<SavedRoutes />);
    expect(screen.getByRole("link", { name: /the nose on windy/i })).toHaveAttribute(
      "href",
      "https://www.windy.com/47.554/-121.550",
    );
  });

  it("shows no Windy link for an MP route whose coordinates are unknown", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ coords: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem(
      "cw_favorites",
      JSON.stringify([{ id: 1, name: "The Nose", area: null, grade: null }]),
    );
    render(<SavedRoutes />);
    expect(await screen.findByText("The Nose")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /on windy/i })).toBeNull();
    vi.unstubAllGlobals();
  });

  it("backfills missing coordinates and then shows the link", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ coords: [{ id: 1, lat: 47.55425, lng: -121.54968 }] }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem(
      "cw_favorites",
      JSON.stringify([{ id: 1, name: "The Nose", area: null, grade: null }]),
    );
    render(<SavedRoutes />);

    const link = await screen.findByRole("link", { name: /the nose on windy/i });
    expect(link).toHaveAttribute("href", "https://www.windy.com/47.554/-121.550");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/routes/coords",
      expect.objectContaining({ method: "POST" }),
    );
    const stored = JSON.parse(localStorage.getItem("cw_favorites")!);
    expect(stored[0]).toMatchObject({ id: 1, lat: 47.55425, lng: -121.54968 });
    vi.unstubAllGlobals();
  });

  it("does not request coordinates when every saved route already has them", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem(
      "cw_favorites",
      JSON.stringify([{ id: 1, name: "The Nose", area: null, grade: null, lat: 1, lng: 2 }]),
    );
    render(<SavedRoutes />);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
