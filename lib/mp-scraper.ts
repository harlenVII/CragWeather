import * as cheerio from "cheerio";

export type ScrapedRoute = {
  name: string;
  lat: number;
  lng: number;
  area: string | null;
  grade: string | null;
};

// Matches lat/lng embedded in onX Backcountry map URL fragment: #zoom/lat/lng/...
const ONXMAPS_COORD_RE = /bc_climb-route-\d+#\d+\/([-\d.]+)\/([-\d.]+)/;

// Generic decimal coordinate pair fallback
const COORD_RE = /(-?\d{1,3}\.\d{4,6}),\s*(-?\d{1,3}\.\d{4,6})/;

function parseCoords(html: string, $: cheerio.CheerioAPI): { lat: number; lng: number } {
  // Primary: extract from the onX Backcountry route link which uses route-specific coords
  const onxHref = $('a[href*="bc_climb-route-"]').attr("href");
  if (onxHref) {
    const m = onxHref.match(ONXMAPS_COORD_RE);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  }

  // Fallback: scan raw HTML for the same pattern
  const m2 = html.match(ONXMAPS_COORD_RE);
  if (m2) return { lat: Number(m2[1]), lng: Number(m2[2]) };

  // Last resort: any decimal coordinate pair in the document
  const m3 = html.match(COORD_RE);
  if (m3) return { lat: Number(m3[1]), lng: Number(m3[2]) };

  throw new Error("coordinates not found");
}

function parseName($: cheerio.CheerioAPI): string {
  // MP h1 contains the route name as a text node followed by nested edit-icon elements.
  // Clone, remove all child elements, then read remaining text.
  const h1 = $("h1").first();
  if (h1.length) {
    // Get only text nodes (not text inside child elements)
    const textContent = h1
      .clone()
      .children()
      .remove()
      .end()
      .text()
      .trim();
    if (textContent) return textContent;

    // Fallback: full text, take first non-empty line
    const line = h1.text().trim().split("\n")[0].trim();
    if (line) return line;
  }
  throw new Error("name not found");
}

export function parseRoutePage(html: string): ScrapedRoute {
  const $ = cheerio.load(html);
  return {
    name: parseName($),
    ...parseCoords(html, $),
    area: null,
    grade: null,
  };
}

export async function scrapeRoute(
  id: number,
  fetcher: typeof fetch = fetch,
): Promise<ScrapedRoute> {
  const ua = process.env.MP_USER_AGENT ?? "CragWeather/0.1";
  const res = await fetcher(`https://www.mountainproject.com/route/${id}`, {
    headers: { "User-Agent": ua, Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`MP returned ${res.status}`);
  const html = await res.text();
  return parseRoutePage(html);
}
