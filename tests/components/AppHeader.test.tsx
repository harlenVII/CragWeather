import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppHeader } from "@/components/AppHeader";

const pathname = vi.hoisted(() => ({ value: "/" }));
// A stable router reference matters here, not just for tidiness: SearchBox's
// effect depends on [q, router] (see components/SearchBox.tsx), so a mock
// that hands back a new object (and a new vi.fn()) on every call makes the
// effect rerun on every render — SearchBox calls setResults([]) with a fresh
// array each time, which schedules another render, which calls this mock
// again. In real Next.js, next/navigation's useRouter() is a stable
// reference, so this only surfaces in a naive test mock; SearchBox.test.tsx
// already hoists a stable mockRouter for the same reason.
const mockRouter = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => mockRouter,
}));

describe("AppHeader", () => {
  it("always shows the wordmark linking home", () => {
    pathname.value = "/route/123";
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: /cragweather/i })).toHaveAttribute("href", "/");
  });

  it("always shows the theme toggle", () => {
    pathname.value = "/";
    render(<AppHeader />);
    expect(screen.getByRole("button", { name: /switch to (light|dark) theme/i })).toBeInTheDocument();
  });

  it("hides the search on the home page, which has its own hero search", () => {
    pathname.value = "/";
    render(<AppHeader />);
    expect(screen.queryByLabelText("Search routes")).toBeNull();
  });

  it("shows the search on a route page", () => {
    pathname.value = "/route/105862922";
    render(<AppHeader />);
    expect(screen.getByLabelText("Search routes")).toBeInTheDocument();
  });

  it("shows the search on a GPS page", () => {
    pathname.value = "/at/37.734,-119.637";
    render(<AppHeader />);
    expect(screen.getByLabelText("Search routes")).toBeInTheDocument();
  });
});
