import Link from "next/link";
import { notFound } from "next/navigation";
import { WeatherView } from "@/components/WeatherView";
import { SaveButton } from "@/components/SaveButton";
import { FetchedAt } from "@/components/FetchedAt";
import { fetchWeather, type WeatherResponse } from "@/lib/weather";
import { parseCoords, formatCoords } from "@/lib/parseCoords";

export const revalidate = 600;

export default async function GpsWeatherPage({
  params,
}: {
  params: Promise<{ coords: string }>;
}) {
  const { coords } = await params;
  const parsed = parseCoords(decodeURIComponent(coords));
  if (!parsed) notFound();

  const { lat, lng } = parsed;
  let weather: WeatherResponse | null = null;
  try {
    weather = await fetchWeather(lat, lng);
  } catch (err) {
    console.error(`fetchWeather failed for GPS (${lat},${lng}):`, err);
    weather = null;
  }

  const fetchedAt = new Date();

  return (
    <main className="route-page">
      <header className="route-header">
        <h1>{formatCoords(lat, lng)}</h1>
        <p className="route-meta">
          <span>GPS location</span>
        </p>
        <SaveButton gps={{ lat, lng }} />
        <p className="weather-fetched-at">
          Weather updated <FetchedAt iso={fetchedAt.toISOString()} />
        </p>
      </header>

      {weather ? (
        <WeatherView weather={weather} />
      ) : (
        <p className="weather-unavailable">Weather unavailable. Please refresh.</p>
      )}

      <footer className="route-footer">
        <Link href="/">← Search another route</Link>
      </footer>
    </main>
  );
}
