export type ParsedCoords = { lat: number; lng: number; source: "url" | "raw" };

const LAT_MIN = -90, LAT_MAX = 90, LNG_MIN = -180, LNG_MAX = 180;

function inRange(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= LAT_MIN && lat <= LAT_MAX &&
    lng >= LNG_MIN && lng <= LNG_MAX
  );
}

/** Human-readable, e.g. "37.7340, -119.6370". Used for display and dedup keys. */
export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/** URL-path-safe (no space), e.g. "37.7340,-119.6370". Used in /at/<coords> links. */
export function coordsPath(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function parseUrl(input: string): ParsedCoords | null {
  // Google place URLs: @lat,lng
  let m = input.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) {
    const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    if (inRange(lat, lng)) return { lat, lng, source: "url" };
  }
  // Google data param: !3dLAT!4dLNG
  m = input.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (m) {
    const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    if (inRange(lat, lng)) return { lat, lng, source: "url" };
  }
  // Query params: ?q= / ?ll= / &sll= / &center= / &daddr= (Google + Apple)
  m = input.match(/[?&](?:q|ll|sll|center|daddr)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (m) {
    const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    if (inRange(lat, lng)) return { lat, lng, source: "url" };
  }
  return null;
}

function parseDms(input: string): ParsedCoords | null {
  // D°M'[S"]? H  (seconds optional). Matches each lat/lng component.
  const DMS = /(\d+)\s*°\s*(\d+)\s*['′]\s*(?:([\d.]+)\s*["″]?)?\s*([NSEW])/gi;
  const matches = [...input.matchAll(DMS)];
  if (matches.length !== 2) return null;

  let lat: number | undefined, lng: number | undefined;
  for (const m of matches) {
    const deg = parseFloat(m[1]);
    const min = parseFloat(m[2]);
    const sec = m[3] ? parseFloat(m[3]) : 0;
    const hemi = m[4].toUpperCase();
    let val = deg + min / 60 + sec / 3600;
    if (hemi === "S" || hemi === "W") val = -val;
    if (hemi === "N" || hemi === "S") lat = val; else lng = val;
  }
  if (lat === undefined || lng === undefined || !inRange(lat, lng)) return null;
  return { lat, lng, source: "raw" };
}

function parseDecimal(input: string): ParsedCoords | null {
  const tokens = [...input.matchAll(/([+-]?\d+(?:\.\d+)?)\s*°?\s*([NSEW])?/gi)]
    .map((m) => ({ value: parseFloat(m[1]), hemi: m[2]?.toUpperCase() }))
    .filter((t) => Number.isFinite(t.value));
  if (tokens.length !== 2) return null;

  let lat: number | undefined, lng: number | undefined;
  // Hemisphere-tagged tokens first (they disambiguate order).
  for (const t of tokens) {
    if (t.hemi === "N" || t.hemi === "S") lat = t.hemi === "S" ? -Math.abs(t.value) : Math.abs(t.value);
    else if (t.hemi === "E" || t.hemi === "W") lng = t.hemi === "W" ? -Math.abs(t.value) : Math.abs(t.value);
  }
  // Fill remaining slots positionally from untagged tokens.
  if (lat === undefined && lng === undefined) {
    lat = tokens[0].value; lng = tokens[1].value;
  } else {
    for (const t of tokens) {
      if (t.hemi) continue;
      if (lat === undefined) lat = t.value;
      else if (lng === undefined) lng = t.value;
    }
  }
  if (lat === undefined || lng === undefined || !inRange(lat, lng)) return null;
  return { lat, lng, source: "raw" };
}

export function parseCoords(input: string): ParsedCoords | null {
  const s = input.trim();
  if (!s) return null;
  return parseUrl(s) ?? parseDms(s) ?? parseDecimal(s);
}
