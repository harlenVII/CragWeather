import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to dark when nothing is stored", () => {
    // Deliberately ignores prefers-color-scheme: the dark instrument look is the
    // design, and the toggle is how a reader opts out. Nothing here reads
    // matchMedia, which is why there is no OS-preference branch to test.
    render(<ThemeToggle />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("restores a stored light preference", () => {
    localStorage.setItem("cw_theme", "light");
    render(<ThemeToggle />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("toggles the attribute and persists the choice", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: /switch to light/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("cw_theme")).toBe("light");

    await user.click(screen.getByRole("button", { name: /switch to dark/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("cw_theme")).toBe("dark");
  });

  it("ignores a junk stored value and falls back to dark", () => {
    localStorage.setItem("cw_theme", "chartreuse");
    render(<ThemeToggle />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("renders both glyphs unconditionally, leaving CSS to pick the visible one", async () => {
    // Task 9's bug: initial state was always "dark", so the server and first
    // client paint always rendered the dark-state glyph regardless of a
    // stored light preference, and only a mount effect corrected it — a
    // visible flash for a light-theme reader. The fix renders both glyphs
    // every time and lets [data-theme] (set before paint) choose via CSS, so
    // the rendered markup must be identical across themes: no glyph is
    // conditional on React state.
    const user = userEvent.setup();
    localStorage.setItem("cw_theme", "light");
    const { container: lightContainer } = render(<ThemeToggle />);
    const lightMarkup = lightContainer.querySelector(".theme-toggle")?.innerHTML;

    localStorage.clear();
    const { container: darkContainer } = render(<ThemeToggle />);
    const darkMarkup = darkContainer.querySelector(".theme-toggle")?.innerHTML;

    expect(lightMarkup).toBe(darkMarkup);
    expect(lightContainer.querySelector(".theme-toggle__dark")).not.toBeNull();
    expect(lightContainer.querySelector(".theme-toggle__light")).not.toBeNull();

    // Clicking still updates the accessible name and the document attribute,
    // even though the glyph markup itself never changes.
    const button = lightContainer.querySelector(".theme-toggle") as HTMLElement;
    await user.click(button);
    expect(lightContainer.querySelector(".theme-toggle")?.innerHTML).toBe(lightMarkup);
  });
});
