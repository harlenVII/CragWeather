import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmJoin } from "@/app/list/[id]/ConfirmJoin";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

beforeEach(() => {
  localStorage.clear();
  pushMock.mockReset();
});

const listId = "abcd1234-0000-0000-0000-000000000001";
const sharedRoutes = [
  { id: 1, name: "The Nose", area: "Yosemite", grade: "5.9" },
  { id: 2, name: "Astroman", area: "Yosemite", grade: "5.11c" },
];

describe("ConfirmJoin", () => {
  it("shows the route count from the shared list", () => {
    render(<ConfirmJoin listId={listId} routes={sharedRoutes} />);
    expect(screen.getByText(/2 routes/i)).toBeInTheDocument();
  });

  it("warns when local favorites will be replaced", () => {
    localStorage.setItem(
      "cw_favorites",
      JSON.stringify([{ id: 99, name: "Other", area: null, grade: null }]),
    );
    render(<ConfirmJoin listId={listId} routes={sharedRoutes} />);
    expect(screen.getByText(/1 local route will be replaced/i)).toBeInTheDocument();
  });

  it("warns when switching from a different synced list", () => {
    localStorage.setItem("cw_list_id", "abcd1234-0000-0000-0000-000000000999");
    render(<ConfirmJoin listId={listId} routes={sharedRoutes} />);
    expect(screen.getByText(/already synced to a different list/i)).toBeInTheDocument();
  });

  it("Link this device writes cw_list_id + favorites and redirects home", async () => {
    render(<ConfirmJoin listId={listId} routes={sharedRoutes} />);
    await userEvent.click(screen.getByRole("button", { name: /link this device/i }));
    expect(localStorage.getItem("cw_list_id")).toBe(listId);
    expect(JSON.parse(localStorage.getItem("cw_favorites")!)).toEqual(sharedRoutes);
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("Cancel navigates home without writing", async () => {
    render(<ConfirmJoin listId={listId} routes={sharedRoutes} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(localStorage.getItem("cw_list_id")).toBeNull();
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("renders a GPS route in the preview with its coordinates", () => {
    render(
      <ConfirmJoin
        listId={listId}
        routes={[{ kind: "gps", lat: 37.734, lng: -119.637, name: "Secret boulder" }]}
      />,
    );
    expect(screen.getByText("Secret boulder")).toBeInTheDocument();
    expect(screen.getByText(/37\.7340, -119\.6370/)).toBeInTheDocument();
  });
});
