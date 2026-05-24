import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SavedRoutes } from "@/components/SavedRoutes";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("SavedRoutes", () => {
  it("renders nothing when there are no favorites", () => {
    const { container } = render(<SavedRoutes />);
    expect(container).toBeEmptyDOMElement();
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
});
