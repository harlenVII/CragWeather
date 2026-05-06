import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { routes, routeMeta } from "@/lib/schema";
import { fetchWeather, type WeatherResponse } from "@/lib/weather";
import { scrapeRoute } from "@/lib/mp-scraper";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }

  const route = await db.query.routes.findFirst({ where: eq(routes.id, id) });
  if (!route) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const meta = await db.query.routeMeta.findFirst({ where: eq(routeMeta.id, id) });
  const fresh = meta && Date.now() - meta.fetchedAt.getTime() < NINETY_DAYS_MS;

  let activeMeta = meta;
  if (!fresh) {
    let scraped;
    try {
      scraped = await scrapeRoute(id);
    } catch {
      return NextResponse.json({ error: "route_unavailable" }, { status: 502 });
    }
    await db
      .insert(routeMeta)
      .values({
        id,
        lat: scraped.lat,
        lng: scraped.lng,
        areaPath: scraped.area,
        grade: scraped.grade,
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: routeMeta.id,
        set: {
          lat: scraped.lat,
          lng: scraped.lng,
          areaPath: scraped.area,
          grade: scraped.grade,
          fetchedAt: new Date(),
        },
      });
    await db.update(routes).set({ name: scraped.name }).where(eq(routes.id, id));
    activeMeta = {
      id,
      lat: scraped.lat,
      lng: scraped.lng,
      areaPath: scraped.area,
      grade: scraped.grade,
      fetchedAt: new Date(),
    };
    route.name = scraped.name;
  }

  let weather: WeatherResponse | null = null;
  try {
    weather = await fetchWeather(activeMeta!.lat, activeMeta!.lng);
  } catch (err) {
    console.error(`fetchWeather failed for route ${id} (${activeMeta!.lat},${activeMeta!.lng}):`, err);
    weather = null;
  }

  return NextResponse.json(
    {
      route: {
        id: route.id,
        name: route.name,
        slug: route.slug,
        area: activeMeta!.areaPath,
        grade: activeMeta!.grade,
        lat: activeMeta!.lat,
        lng: activeMeta!.lng,
        mpUrl: `https://www.mountainproject.com/route/${id}`,
      },
      weather,
    },
    { headers: { "Cache-Control": "public, max-age=600" } },
  );
}
