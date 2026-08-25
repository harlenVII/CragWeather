"use client";

import { useFavorites, routeKey, type SavedGpsRoute } from "@/lib/favorites";
import { formatCoords } from "@/lib/parseCoords";

type GpsTitleProps = {
  lat: number;
  lng: number;
  /** When set (including null), takes precedence over the favorites lookup — lets a sibling SaveButton report an in-page save/remove immediately. */
  override?: SavedGpsRoute | null;
};

export function GpsTitle({ lat, lng, override }: GpsTitleProps) {
  const { favorites } = useFavorites();
  const coords = formatCoords(lat, lng);
  const key = routeKey({ kind: "gps", lat, lng, name: "" });
  const saved =
    override !== undefined
      ? override
      : favorites.find((r): r is SavedGpsRoute => r.kind === "gps" && routeKey(r) === key) ?? null;
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
