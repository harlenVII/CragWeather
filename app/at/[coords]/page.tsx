import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { WeatherView } from "@/components/WeatherView";
import { FetchedAt } from "@/components/FetchedAt";
import { GpsHeader } from "@/components/GpsHeader";
import { WindyLink } from "@/components/WindyLink";
import { fetchWeather, type WeatherResponse } from "@/lib/weather";
import { fetchAirQuality, type AirQualityResponse } from "@/lib/airQuality";
import { parseCoords, formatCoords } from "@/lib/parseCoords";

export const revalidate = 600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ coords: string }>;
}): Promise<Metadata> {
  const { coords } = await params;
  const parsed = parseCoords(decodeURIComponent(coords));
  if (!parsed) return {};
  return { title: formatCoords(parsed.lat, parsed.lng) };
}

export default async function GpsWeatherPage({
  params,
}: {
  params: Promise<{ coords: string }>;
}) {
  const { coords } = await params;
  const parsed = parseCoords(decodeURIComponent(coords));
  if (!parsed) notFound();

  const { lat, lng } = parsed;
  // Run concurrently so air quality never adds to weather latency, and catch
  // each independently: air quality is a second endpoint with its own failure
  // mode and must never be able to blank the weather page. Promise.all over
  // already-caught promises, so neither rejection can settle the pair.
  const [weather, air] = await Promise.all([
    fetchWeather(lat, lng).catch((err): WeatherResponse | null => {
      console.error(`fetchWeather failed for GPS (${lat},${lng}):`, err);
      return null;
    }),
    fetchAirQuality(lat, lng).catch((err): AirQualityResponse | null => {
      console.error(`fetchAirQuality failed for GPS (${lat},${lng}):`, err);
      return null;
    }),
  ]);

  const fetchedAt = new Date();

  return (
    <main className="route-page">
      <header className="route-header">
        <GpsHeader lat={lat} lng={lng} />
        <p>
          <WindyLink lat={lat} lng={lng} />
        </p>
        <p className="weather-fetched-at">
          Weather updated <FetchedAt iso={fetchedAt.toISOString()} />
        </p>
      </header>

      {weather ? (
        <WeatherView weather={weather} air={air} />
      ) : (
        <p className="weather-unavailable">Weather unavailable. Please refresh.</p>
      )}

      <footer className="route-footer">
        <Link href="/">← Search another route</Link>
      </footer>
    </main>
  );
}
