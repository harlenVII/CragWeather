import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { redirect } from "next/navigation";

// Prevent actual navigation and DB calls
vi.mock("next/navigation", () => ({ redirect: vi.fn(), Link: vi.fn(), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/components/SearchBox", () => ({ SearchBox: () => <div /> }));
vi.mock("@/lib/search", () => ({ searchRoutes: vi.fn().mockResolvedValue([]) }));

// Dynamic import so mocks are registered before the module loads
const { default: HomePage } = await import("@/app/page");

describe("HomePage ?mp= redirect", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
  });

  it("redirects to /route/:id when a valid MP URL is supplied", async () => {
    await render(
      await HomePage({
        searchParams: Promise.resolve({
          mp: "https://www.mountainproject.com/route/105748662/the-nose",
        }),
      }),
    );
    expect(redirect).toHaveBeenCalledWith("/route/105748662");
  });

  it("does not redirect when mp param is absent", async () => {
    await render(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not redirect when mp param does not match an MP URL", async () => {
    await render(
      await HomePage({
        searchParams: Promise.resolve({ mp: "https://example.com/route/123" }),
      }),
    );
    expect(redirect).not.toHaveBeenCalled();
  });
});
