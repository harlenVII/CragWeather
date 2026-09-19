import "./globals.css";
import type { Metadata } from "next";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: {
    template: "%s · CragWeather",
    default: "CragWeather",
  },
  description: "14-day weather windows for climbing routes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Runs before first paint. Without it every load flashes the light
            theme before React hydrates, because dark is the default. Must stay
            inline and synchronous — a deferred script runs after paint. The rule
            here is duplicated in ThemeToggle.readTheme(); keep them in step. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("cw_theme")==="light"?"light":"dark";document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","dark")}})()`,
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b0f14" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#c2410c" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CragWeather" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
