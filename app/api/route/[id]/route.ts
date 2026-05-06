import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { routes, routeMeta } from "@/lib/schema";
import { fetchWeather, type WeatherResponse } from "@/lib/weather";

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

  if (!fresh) {
    return NextResponse.json({ error: "not_implemented_yet" }, { status: 501 });
  }

  let weather: WeatherResponse | null = null;
  try {
    weather = await fetchWeather(meta.lat, meta.lng);
  } catch {
    weather = null;
  }

  return NextResponse.json(
    {
      route: {
        id: route.id,
        name: route.name,
        slug: route.slug,
        area: meta.areaPath,
        grade: meta.grade,
        lat: meta.lat,
        lng: meta.lng,
        mpUrl: `https://www.mountainproject.com/route/${id}`,
      },
      weather,
    },
    { headers: { "Cache-Control": "public, max-age=600" } },
  );
}
