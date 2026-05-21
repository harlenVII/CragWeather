// tests/components/SearchBox.test.tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { SearchBox } from "@/components/SearchBox";

const mockPush = vi.hoisted(() => vi.fn());
const mockRouter = vi.hoisted(() => ({ push: mockPush }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

describe("SearchBox", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("debounces input and fetches /api/search", async () => {
    const calls: string[] = [];
    server.use(
      http.get("http://localhost/api/search", ({ request }) => {
        calls.push(new URL(request.url).searchParams.get("q") ?? "");
        return HttpResponse.json({ results: [{ id: 1, slug: "the-nose", name: "The Nose" }] });
      }),
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SearchBox />);
    const input = screen.getByRole("searchbox");

    await userEvent.type(input, "the");
    // No fetch yet — within debounce window
    expect(calls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(250);
    expect(calls.at(-1)).toBe("the");
    expect(await screen.findByText("The Nose")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("renders a result link to /route/:id", async () => {
    server.use(
      http.get("http://localhost/api/search", () =>
        HttpResponse.json({ results: [{ id: 42, slug: "x", name: "X Route" }] }),
      ),
    );
    render(<SearchBox />);
    await userEvent.type(screen.getByRole("searchbox"), "x");
    const link = await screen.findByRole("link", { name: /X Route/i });
    expect(link).toHaveAttribute("href", "/route/42");
  });

  it("navigates directly when a Mountain Project URL is pasted", async () => {
    const user = userEvent.setup();
    render(<SearchBox />);
    await user.click(screen.getByRole("searchbox"));
    await user.paste("https://www.mountainproject.com/route/105862922/the-nose");
    expect(mockPush).toHaveBeenCalledWith("/route/105862922");
  });

  it("clears the dropdown immediately when a Mountain Project URL is pasted", async () => {
    server.use(
      http.get("http://localhost/api/search", () =>
        HttpResponse.json({
          results: [{ id: 105862922, slug: "the-nose", name: "The Nose", areaPath: null, grade: "5.9" }],
        }),
      ),
    );
    const user = userEvent.setup();
    render(<SearchBox />);

    // Type a query so the dropdown appears
    await user.type(screen.getByRole("searchbox"), "the nose");
    const listbox = await screen.findByRole("listbox");
    expect(listbox).toBeInTheDocument();

    // Paste a Mountain Project URL
    await user.clear(screen.getByRole("searchbox"));
    await user.paste("https://www.mountainproject.com/route/105862922/the-nose");

    // Dropdown should be gone
    expect(screen.queryByRole("listbox")).toBeNull();
    // Navigation should have been triggered
    expect(mockPush).toHaveBeenCalledWith("/route/105862922");
  });

  it("does not call router.push for plain text queries", async () => {
    server.use(
      http.get("http://localhost/api/search", () =>
        HttpResponse.json({ results: [] }),
      ),
    );
    const user = userEvent.setup();
    render(<SearchBox />);
    await user.click(screen.getByRole("searchbox"));
    await user.paste("the nose");
    expect(mockPush).not.toHaveBeenCalled();
  });
});
