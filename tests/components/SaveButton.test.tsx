import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaveButton } from "@/components/SaveButton";
import type { SavedRoute } from "@/lib/favorites";

beforeEach(() => localStorage.clear());

const mpRoute: SavedRoute = { id: 1, name: "The Nose", area: "Yosemite", grade: "5.9" };

describe("SaveButton — MP route", () => {
  it("saves and removes an MP route", async () => {
    render(<SaveButton route={mpRoute} />);
    await userEvent.click(screen.getByRole("button", { name: /save route/i }));
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual([mpRoute]);
    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual([]);
  });
});

describe("SaveButton — GPS location", () => {
  it("prompts for a name and saves a GPS route", async () => {
    render(<SaveButton gps={{ lat: 37.734, lng: -119.637 }} />);
    await userEvent.click(screen.getByRole("button", { name: /save location/i }));
    await userEvent.type(screen.getByLabelText(/location name/i), "Secret boulder");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual([
      { kind: "gps", lat: 37.734, lng: -119.637, name: "Secret boulder" },
    ]);
  });

  it("defaults the name to the formatted coordinates when blank", async () => {
    render(<SaveButton gps={{ lat: 37.734, lng: -119.637 }} />);
    await userEvent.click(screen.getByRole("button", { name: /save location/i }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual([
      { kind: "gps", lat: 37.734, lng: -119.637, name: "37.7340, -119.6370" },
    ]);
  });

  it("shows saved state and removes when already saved", async () => {
    localStorage.setItem(
      "cw_favorites",
      JSON.stringify([{ kind: "gps", lat: 37.734, lng: -119.637, name: "Secret boulder" }]),
    );
    render(<SaveButton gps={{ lat: 37.734, lng: -119.637 }} />);
    expect(screen.getByText(/saved ✓/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual([]);
  });
});
