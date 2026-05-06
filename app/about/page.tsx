import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="about">
      <h1>About CragWeather</h1>

      <h2>Data sources</h2>
      <ul>
        <li>
          <strong>Route data</strong> — derived from Mountain Project's public sitemap and route pages.
          We scrape each route page exactly once and cache the result; refreshes every 90 days.
        </li>
        <li>
          <strong>Weather</strong> — <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>,
          fetched live per page view.
        </li>
      </ul>

      <h2>Attribution</h2>
      <p>
        Each route links back to its source page on Mountain Project. CragWeather is a personal
        project and is not affiliated with Mountain Project / onX.
      </p>

      <h2>Notes</h2>
      <p>
        Coordinates are best-effort and parsed from public route pages. If a forecast looks
        obviously wrong, please cross-check the linked MP page.
      </p>

      <p><Link href="/">← Home</Link></p>
    </main>
  );
}
