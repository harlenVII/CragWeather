import type { SavedRouteJson } from "./schema";

const MAX_ROUTES = 50;
const LAT_MIN = -90, LAT_MAX = 90, LNG_MIN = -180, LNG_MAX = 180;

export function validateRoutesBody(body: unknown): SavedRouteJson[] | null {
  if (!body || typeof body !== "object") return null;
  const routes = (body as { routes?: unknown }).routes;
  if (!Array.isArray(routes)) return null;
  if (routes.length > MAX_ROUTES) return null;

  const out: SavedRouteJson[] = [];
  for (const r of routes) {
    if (!r || typeof r !== "object") return null;
    const rec = r as Record<string, unknown>;

    if (rec.kind === "gps") {
      if (typeof rec.lat !== "number" || !Number.isFinite(rec.lat)) return null;
      if (typeof rec.lng !== "number" || !Number.isFinite(rec.lng)) return null;
      if (rec.lat < LAT_MIN || rec.lat > LAT_MAX) return null;
      if (rec.lng < LNG_MIN || rec.lng > LNG_MAX) return null;
      if (typeof rec.name !== "string") return null;
      out.push({ kind: "gps", lat: rec.lat, lng: rec.lng, name: rec.name });
    } else {
      if (typeof rec.id !== "number") return null;
      if (typeof rec.name !== "string") return null;
      if (rec.area !== null && typeof rec.area !== "string") return null;
      if (rec.grade !== null && typeof rec.grade !== "string") return null;
      out.push({
        id: rec.id,
        name: rec.name,
        area: rec.area as string | null,
        grade: rec.grade as string | null,
      });
    }
  }
  return out;
}
