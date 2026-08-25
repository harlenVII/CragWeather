"use client";

import { useFavorites, routeKey, type SavedGpsRoute } from "@/lib/favorites";
import { formatCoords } from "@/lib/parseCoords";

export function GpsTitle({ lat, lng }: { lat: number; lng: number }) {
  const { favorites } = useFavorites();
  const coords = formatCoords(lat, lng);
  const key = routeKey({ kind: "gps", lat, lng, name: "" });
  const saved = favorites.find(
    (r): r is SavedGpsRoute => r.kind === "gps" && routeKey(r) === key,
  );
  const title = saved && saved.name !== coords ? saved.name : coords;

  return (
    <>
      <h1>{title}</h1>
      <p className="route-meta">
        <span>GPS location</span>
        {title !== coords && <span> · {coords}</span>}
      </p>
    </>
  );
}
