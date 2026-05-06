import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { routes } from "@/lib/schema";
import {
  parseRouteSitemap,
  parseSitemapIndex,
  slugToName,
} from "@/lib/sitemap";

const SITEMAP_INDEX = "https://www.mountainproject.com/sitemap.xml";
const CRAWL_DELAY_MS = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function upsertRoutes(rows: { id: number; slug: string }[]) {
  if (rows.length === 0) return;
  const values = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: slugToName(r.slug),
  }));
  await db
    .insert(routes)
    .values(values)
    .onConflictDoUpdate({
      target: routes.id,
      set: {
        slug: sql`excluded.slug`,
      },
    });
}

async function fetchText(url: string): Promise<string> {
  const ua = process.env.MP_USER_AGENT ?? "CragWeather-indexer/0.1";
  const res = await fetch(url, { headers: { "User-Agent": ua, Accept: "application/xml" } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

async function main() {
  console.log("[index] fetching sitemap index");
  const indexXml = await fetchText(SITEMAP_INDEX);
  const subs = parseSitemapIndex(indexXml);
  console.log(`[index] ${subs.length} route sub-sitemaps`);

  let total = 0;
  for (let i = 0; i < subs.length; i++) {
    if (i > 0) await sleep(CRAWL_DELAY_MS);
    const url = subs[i];
    console.log(`[index] (${i + 1}/${subs.length}) ${url}`);
    let xml: string;
    try {
      xml = await fetchText(url);
    } catch (e) {
      console.error(`[index] skip on error: ${(e as Error).message}`);
      continue;
    }
    const rows = parseRouteSitemap(xml);
    await upsertRoutes(rows);
    total += rows.length;
    console.log(`[index] +${rows.length} (running total ${total})`);
  }

  console.log(`[index] done. ${total} routes upserted.`);
}

if (process.argv[1] && process.argv[1].endsWith("build-index.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
