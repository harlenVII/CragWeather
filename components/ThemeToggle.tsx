"use client";
import { useEffect, useState } from "react";

export const THEME_KEY = "cw_theme";
export type Theme = "dark" | "light";

/** Dark unless a valid stored preference says otherwise. `prefers-color-scheme`
 *  is deliberately ignored: the dark instrument look is the design, and the
 *  toggle is how a reader opts out of it. Must match the inline <head> script
 *  in app/layout.tsx, which runs the same rule before first paint. */
function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark"; // Safari private mode throws on localStorage access.
  }
}

/** Point the single <meta name="theme-color"> at the active theme's page
 *  background. Read off the document rather than written as a literal so the
 *  browser-bar colour cannot drift from --bg-0, and so this file defines no
 *  raw colour of its own. A no-op if the tag or the token is missing. */
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg-0").trim();
  if (bg) meta.setAttribute("content", bg);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const t = readTheme();
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    syncThemeColor();
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    syncThemeColor();
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* Non-persistent is acceptable; the toggle still works for this page. */
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      {/* Both glyphs are always in the DOM; CSS (driven by the
          [data-theme] attribute the inline <head> script sets before first
          paint) picks which one shows. Deciding this in React state instead
          meant the server and the first client paint always rendered the
          dark-state glyph, flashing the wrong icon for a light-theme reader
          on every load. The aria-label above still comes from state — the
          one-frame label mismatch is not visible the way the glyph flash
          was, and this keeps `getByRole("button", { name: /switch to
          (light|dark) theme/i })` in the existing tests working unchanged. */}
      <span className="theme-toggle__dark" aria-hidden="true">☀</span>
      <span className="theme-toggle__light" aria-hidden="true">☾</span>
    </button>
  );
}
