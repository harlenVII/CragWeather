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

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const t = readTheme();
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
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
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
    </button>
  );
}
