const LOC_RE = /<loc>([^<]+)<\/loc>/g;
const ROUTE_URL_RE = /\/route\/(\d+)\/([^/?#]+)$/;

export function parseSitemapIndex(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(LOC_RE)) {
    const url = m[1].trim();
    if (url.includes("sitemap-routes")) out.push(url);
  }
  return out;
}

export function parseRouteSitemap(xml: string): { id: number; slug: string }[] {
  const out: { id: number; slug: string }[] = [];
  for (const m of xml.matchAll(LOC_RE)) {
    const url = m[1].trim();
    const r = url.match(ROUTE_URL_RE);
    if (r) out.push({ id: Number(r[1]), slug: r[2] });
  }
  return out;
}

export function slugToName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
