import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GpsHeader } from "@/components/GpsHeader";

// GpsHeader owns the `override` state that lets GpsTitle (via the shared
// RouteHeader shell) reflect a save/remove immediately, without a page
// reload — and keeps document.title in sync. This is the single most
// fragile wire in the header consolidation: `override` must reach GpsTitle
// as `undefined` (fall back to the favorites lookup) vs. explicit `null`
// (known unsaved, do NOT fall back), and `onSaved` must still reach
// SaveButton so it can report those transitions.
beforeEach(() => localStorage.clear());

describe("GpsHeader — save-state override wiring", () => {
  it("falls back to the favorites lookup when nothing has been saved this session (override undefined)", () => {
    localStorage.setItem(
      "cw_favorites",
      JSON.stringify([{ kind: "gps", lat: 37.734, lng: -119.637, name: "Secret boulder" }]),
    );
    render(<GpsHeader lat={37.734} lng={-119.637} />);
    expect(screen.getByRole("heading", { name: "Secret boulder" })).toBeInTheDocument();
    expect(document.title).toContain("Secret boulder");
  });

  it("updates the title immediately on save, via onSaved reaching SaveButton", async () => {
    render(<GpsHeader lat={37.734} lng={-119.637} />);
    expect(screen.getByRole("heading", { name: "37.7340, -119.6370" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /save location/i }));
    await userEvent.type(screen.getByLabelText(/location name/i), "Secret boulder");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(screen.getByRole("heading", { name: "Secret boulder" })).toBeInTheDocument();
    expect(document.title).toContain("Secret boulder");
  });

  it("reverts to coordinates on remove via an explicit null override, not a stale favorites read", async () => {
    localStorage.setItem(
      "cw_favorites",
      JSON.stringify([{ kind: "gps", lat: 37.734, lng: -119.637, name: "Secret boulder" }]),
    );
    render(<GpsHeader lat={37.734} lng={-119.637} />);
    expect(screen.getByRole("heading", { name: "Secret boulder" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /remove/i }));

    // override is now explicitly null ("known unsaved"), which must win over
    // whatever the favorites lookup would otherwise report.
    expect(screen.getByRole("heading", { name: "37.7340, -119.6370" })).toBeInTheDocument();
    expect(document.title).toContain("37.7340, -119.6370");
  });

  it("still renders passed-through links and children alongside the save action", () => {
    render(
      <GpsHeader lat={37.734} lng={-119.637} links={<a href="https://windy.com">Windy</a>}>
        <span>updated just now</span>
      </GpsHeader>,
    );
    expect(screen.getByRole("link", { name: "Windy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save location/i })).toBeInTheDocument();
    expect(screen.getByText("updated just now")).toBeInTheDocument();
  });
});
