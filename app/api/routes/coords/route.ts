import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { routeMeta } from "@/lib/schema";

/** Mirrors the favorites cap — a client never needs more than one list's worth. */
const MAX_IDS = 50;

function parseIds(body: unknown): number[] | null {
  if (!body || typeof body !== "object") return null;
  const ids = (body as { ids?: unknown }).ids;
  if (!Array.isArray(ids)) return null;
  if (ids.length > MAX_IDS) return null;
  for (const id of ids) {
    if (typeof id !== "number" || !Number.isSafeInteger(id)) return null;
  }
  return ids as number[];
}

/**
 * Bulk lookup of cached coordinates for saved MP routes.
 * Reads `route_meta` only — never scrapes — so unknown ids simply return nothing.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const ids = parseIds(body);
  if (!ids) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  if (ids.length === 0) return NextResponse.json({ coords: [] });

  const rows = await db
    .select({ id: routeMeta.id, lat: routeMeta.lat, lng: routeMeta.lng })
    .from(routeMeta)
    .where(inArray(routeMeta.id, ids));

  return NextResponse.json({ coords: rows });
}
