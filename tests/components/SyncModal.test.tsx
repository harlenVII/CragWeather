import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { SyncModal } from "@/components/SyncModal";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

let mockScannerProps: { onDecode: (text: string) => void; onError: (reason: "denied" | "no-camera" | "other") => void } | null = null;
vi.mock("@/components/QrScanner", () => ({
  QrScanner: (props: { onDecode: (text: string) => void; onError: (reason: "denied" | "no-camera" | "other") => void }) => {
    mockScannerProps = props;
    return <div data-testid="mock-qr-scanner" />;
  },
}));

beforeEach(() => {
  vi.restoreAllMocks();
  pushMock.mockReset();
  mockScannerProps = null;
});

describe("SyncModal", () => {
  it("when not linked, shows a create-list button after navigating to Share my list", async () => {
    render(<SyncModal open onClose={() => {}} listId={null} createSyncedList={async () => null} unlink={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /share my list/i }));
    expect(screen.getByRole("button", { name: /create shared list/i })).toBeInTheDocument();
    expect(screen.queryByText(/^https?:\/\//)).not.toBeInTheDocument();
  });

  it("creating a list calls createSyncedList and the URL appears once listId prop updates", async () => {
    const createSyncedList = vi.fn().mockResolvedValue("abcd1234-0000-0000-0000-000000000001");

    function Wrapper() {
      const [listId, setListId] = useState<string | null>(null);
      async function wrappedCreate() {
        const id = await createSyncedList();
        if (id) setListId(id);
        return id;
      }
      return (
        <SyncModal open onClose={() => {}} listId={listId} createSyncedList={wrappedCreate} unlink={() => {}} />
      );
    }

    render(<Wrapper />);
    await userEvent.click(screen.getByRole("button", { name: /share my list/i }));
    await userEvent.click(screen.getByRole("button", { name: /create shared list/i }));

    await waitFor(() => {
      expect(screen.getByText(/abcd1234-0000-0000-0000-000000000001/)).toBeInTheDocument();
    });
    expect(createSyncedList).toHaveBeenCalledTimes(1);
  });

  it("when already linked, shows existing URL and an unlink button", () => {
    render(
      <SyncModal
        open
        onClose={() => {}}
        listId="abcd1234-0000-0000-0000-000000000002"
        createSyncedList={async () => null}
        unlink={() => {}}
      />,
    );
    expect(screen.getByText(/abcd1234-0000-0000-0000-000000000002/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unlink this device/i })).toBeInTheDocument();
  });

  it("unlink calls unlink prop and closes the modal", async () => {
    const onClose = vi.fn();
    const unlink = vi.fn();
    render(
      <SyncModal
        open
        onClose={onClose}
        listId="abcd1234-0000-0000-0000-000000000003"
        createSyncedList={async () => null}
        unlink={unlink}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /unlink this device/i }));
    expect(unlink).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render anything when open is false", () => {
    const { container } = render(
      <SyncModal open={false} onClose={() => {}} listId={null} createSyncedList={async () => null} unlink={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("scanning a valid list URL pushes to /list/<uuid> and closes the modal", async () => {
    const onClose = vi.fn();
    render(
      <SyncModal open onClose={onClose} listId={null} createSyncedList={async () => null} unlink={() => {}} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /join a list/i }));
    await userEvent.click(screen.getByRole("button", { name: /scan qr code/i }));

    expect(screen.getByTestId("mock-qr-scanner")).toBeInTheDocument();
    expect(mockScannerProps).not.toBeNull();

    mockScannerProps!.onDecode("https://cragweather.app/list/abcd1234-0000-0000-0000-000000000099");

    expect(pushMock).toHaveBeenCalledWith("/list/abcd1234-0000-0000-0000-000000000099");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
