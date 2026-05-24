import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncModal } from "@/components/SyncModal";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("SyncModal", () => {
  it("when not linked, shows a create-list button", () => {
    render(<SyncModal open onClose={() => {}} />);
    expect(screen.getByRole("button", { name: /create shared list/i })).toBeInTheDocument();
    expect(screen.queryByText(/^https?:\/\//)).not.toBeInTheDocument();
  });

  it("creating a list shows the URL", async () => {
    localStorage.setItem("cw_favorites", JSON.stringify([{ id: 1, name: "x", area: null, grade: null }]));
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "abcd1234-0000-0000-0000-000000000001" }), { status: 200 }),
    );

    render(<SyncModal open onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /create shared list/i }));

    await waitFor(() => {
      expect(screen.getByText(/abcd1234-0000-0000-0000-000000000001/)).toBeInTheDocument();
    });
    expect(fetchSpy).toHaveBeenCalledWith("/api/list", expect.objectContaining({ method: "POST" }));
  });

  it("when already linked, shows existing URL and an unlink button", () => {
    localStorage.setItem("cw_list_id", "abcd1234-0000-0000-0000-000000000002");
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ routes: [] }), { status: 200 }),
    );

    render(<SyncModal open onClose={() => {}} />);
    expect(screen.getByText(/abcd1234-0000-0000-0000-000000000002/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unlink this device/i })).toBeInTheDocument();
  });

  it("unlink clears localStorage and closes the modal", async () => {
    localStorage.setItem("cw_list_id", "abcd1234-0000-0000-0000-000000000003");
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ routes: [] }), { status: 200 }),
    );
    const onClose = vi.fn();
    render(<SyncModal open onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: /unlink this device/i }));
    expect(localStorage.getItem("cw_list_id")).toBeNull();
    expect(onClose).toHaveBeenCalled();
  });

  it("does not render anything when open is false", () => {
    const { container } = render(<SyncModal open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
