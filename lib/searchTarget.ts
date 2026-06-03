import { parseCoords } from "./parseCoords";

const MP_ROUTE_RE = /mountainproject\.com\/route\/(\d+)/;
// /v/<id> is a generic short link whose number is NOT the route id — it must be
// resolved server-side by following the redirect (see app/v/[id]/page.tsx).
const MP_SHORT_RE = /mountainproject\.com\/v\/(\d+)/;

export type SearchTarget =
  | { kind: "mp"; id: string }
  | { kind: "mp-short"; id: string }
  | { kind: "coords"; lat: number; lng: number; source: "url" | "raw" }
  | null;

export function parseSearchTarget(input: string): SearchTarget {
  const route = MP_ROUTE_RE.exec(input);
  if (route) return { kind: "mp", id: route[1] };
  const short = MP_SHORT_RE.exec(input);
  if (short) return { kind: "mp-short", id: short[1] };
  const coords = parseCoords(input);
  if (coords) return { kind: "coords", lat: coords.lat, lng: coords.lng, source: coords.source };
  return null;
}
