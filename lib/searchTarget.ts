import { parseCoords } from "./parseCoords";

const MP_URL_RE = /mountainproject\.com\/(?:route|v)\/(\d+)/;

export type SearchTarget =
  | { kind: "mp"; id: string }
  | { kind: "coords"; lat: number; lng: number; source: "url" | "raw" }
  | null;

export function parseSearchTarget(input: string): SearchTarget {
  const mp = MP_URL_RE.exec(input);
  if (mp) return { kind: "mp", id: mp[1] };
  const coords = parseCoords(input);
  if (coords) return { kind: "coords", lat: coords.lat, lng: coords.lng, source: coords.source };
  return null;
}
