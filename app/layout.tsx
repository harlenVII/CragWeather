import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CragWeather",
  description: "14-day weather windows for climbing routes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
