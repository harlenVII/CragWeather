import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WeatherView } from "@/components/WeatherView";

type ApiResponse = {
  route: {
    id: number; name: string; slug: string;
    area: string | null; grade: string | null;
    lat: number; lng: number; mpUrl: string;
  };
  weather: {
    daily: import("@/lib/weather").DailyWeather[];
    hourly: import("@/lib/weather").HourlyWeather[];
  } | null;
};

async function getRoute(id: string): Promise<ApiResponse | null> {
  const h = await headers();
  const host = h.get("host")!;
  const proto = h.get("x-forwarded-proto") ?? "http";
  const res = await fetch(`${proto}://${host}/api/route/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (res.status === 502) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "route_unavailable");
  }
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return (await res.json()) as ApiResponse;
}

export default async function RoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getRoute(id);
  if (!data) notFound();

  const { route, weather } = data;

  return (
    <main className="route-page">
      <header className="route-header">
        <h1>{route.name}</h1>
        <p className="route-meta">
          {route.area && <span>{route.area}</span>}
          {route.grade && <span> · {route.grade}</span>}
        </p>
        <p>
          <a href={route.mpUrl} target="_blank" rel="noreferrer">
            View on Mountain Project ↗
          </a>
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
