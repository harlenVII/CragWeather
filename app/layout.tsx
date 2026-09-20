import "./globals.css";
import type { Metadata } from "next";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import { AppHeader } from "@/components/AppHeader";
import { inter } from "@/lib/fonts";

export const metadata: Metadata = {
  title: {
    template: "%s · CragWeather",
    default: "CragWeather",
  },
  description: "14-day weather windows for climbing routes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* Runs before first paint. Dark is the unqualified :root default in
            tokens.css, so an unset [data-theme] already paints dark on its own —
            this script exists for the reader who previously chose light: without
            it, their page paints dark for one frame, then snaps to light once
            React reads localStorage. Must stay inline and synchronous — a
            deferred script runs after paint. The rule here is duplicated in
            ThemeToggle.readTheme(); keep them in step. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("cw_theme")==="light"?"light":"dark";document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","dark")}})()`,
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        {/* ONE tag, updated by ThemeToggle, not two keyed to
            `prefers-color-scheme` — which does not drive this app's theme at
            all (dark is the default whatever the OS says), so an OS-light
            reader on the dark default was handed the accent colour for their
            browser bar. The literal is the dark --bg-0: OS chrome reads this
            before any stylesheet loads, so it cannot be a var() — one of the
            documented exceptions to the token rule. ThemeToggle overwrites it
            on mount and on every flip by reading --bg-0 off the document, so
            this value only has to be right for the default. */}
        <meta name="theme-color" content="#0b0f14" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CragWeather" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        <AppHeader />
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
