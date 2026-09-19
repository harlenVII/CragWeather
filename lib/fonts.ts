import localFont from "next/font/local";

/** Self-hosted so there is no Google Fonts request and no layout shift.
 *  `display: swap` plus next/font's automatic size-adjust fallback keeps
 *  first paint readable without reflowing when the file lands. */
export const inter = localFont({
  src: "../public/fonts/InterVariable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-sans",
  fallback: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif"],
});
