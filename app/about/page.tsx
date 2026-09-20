import type { Metadata } from "next";
import { GOOD_MAX_C, GREASY_MIN_C } from "@/lib/dewPointBands";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <main className="about">
      <h1>About CragWeather</h1>

      <p>
        CragWeather shows a two-week weather window for a climbing route: up to 15 days
        of forecast and the days just behind you, so you can see both what is coming and
        how wet the rock has been. You can pick 7, 10 or 15 days per page.
      </p>

      <h2>Data sources</h2>
      <ul>
        <li>
          <strong>Route data</strong> — derived from Mountain Project&apos;s public sitemap and
          route pages. Each route page is scraped once and cached; coordinates refresh every
          90 days.
        </li>
        <li>
          <strong>Weather</strong> — <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>,
          fetched live per page view and cached for ten minutes.
        </li>
        <li>
          <strong>Air quality</strong> — Open-Meteo&apos;s{" "}
          <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noreferrer">air quality API</a>,
          which serves the European Union&apos;s CAMS model. US AQI only.
        </li>
      </ul>

      <h2>How the forecast is chosen</h2>
      <p>
        There is no single weather model behind these numbers. Open-Meteo picks the
        highest-resolution model that covers the crag and falls back outward from there —
        a national 1–2 km model for the first day or two where one exists, then a regional
        model, then a global one. In practice that means the UK Met Office over the Peak
        District, ICON-D2 over Céüse, MET Norway over Flatanger and GFS across the US.
      </p>
      <p>
        The trade-off is that the models are not labelled per hour: the forecast tells you
        the values it settled on, not which model produced them. Expect the first 48 hours
        to be meaningfully sharper than day 12.
      </p>

      <h2>Reading the charts</h2>
      <ul>
        <li>
          <strong>Dew point</strong> is the friction signal, not humidity. Below {GOOD_MAX_C}°C
          the air is dry and rock feels good; above {GREASY_MIN_C}°C it starts to feel greasy.
          Those bands are shaded on the panel.
        </li>
        <li>
          <strong>Air quality stops early.</strong> CAMS forecasts about five days ahead, so the
          last stretch of a 10- or 15-day window has no data at all. Those hours are shaded
          grey rather than left blank, because an empty chart and a clean-air chart should not
          look alike.
        </li>
        <li>
          <strong>Shaded columns</strong> mark nights (sunset to sunrise) and weekends. Night
          bands are drawn to the nearest hour; the exact sunrise and sunset times are on the
          day cards.
        </li>
        <li>
          <strong>Today appears twice</strong> — as a full-day forecast above, and as a partial
          bar in the history below covering only the hours that have already happened. The
          partial day is marked with an asterisk.
        </li>
      </ul>

      <h2>Saved routes and sharing</h2>
      <p>
        Favourites live in your browser&apos;s local storage, not on a server. There are no
        accounts, and clearing site data clears them.
      </p>
      <p>
        Syncing to another device creates a shared list at a random URL.{" "}
        <strong>That URL is the only thing protecting it.</strong> Anyone who has the link can
        read your list and overwrite it, and there is no way to revoke it — so treat it as
        public, and start a new list if you would rather the old link stopped working.
      </p>

      <h2>Attribution</h2>
      <p>
        Each route links back to its source page on Mountain Project. CragWeather is a
        personal project and is not affiliated with Mountain Project, onX or Open-Meteo.
      </p>

      <h2>Limitations</h2>
      <ul>
        <li>
          Coordinates are parsed from public route pages and are best-effort. They locate the
          crag, not the individual pitch. If a forecast looks obviously wrong, cross-check the
          linked Mountain Project page.
        </li>
        <li>
          Forecasts are for the grid cell containing those coordinates. No model here knows
          about your aspect, your tree cover or the cold air pooling in the valley below you,
          and air quality is coarser still at roughly 45 km, so neighbouring crags will read
          the same.
        </li>
        <li>
          Times are the crag&apos;s local clock, but the split between forecast and history
          follows <em>your</em> device&apos;s date. Viewing a crag many timezones away can shift
          that boundary by a day.
        </li>
        <li>
          Nothing here is a safety call. Rock takes longer to dry than the ground does, and
          sandstone in particular stays fragile well after the rain stops.
        </li>
      </ul>
    </main>
  );
}
