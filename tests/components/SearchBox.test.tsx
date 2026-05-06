// tests/components/SearchBox.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { SearchBox } from "@/components/SearchBox";

describe("SearchBox", () => {
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
});
