import { sql } from "drizzle-orm";
import { db } from "./db";
import { routes } from "./schema";

export type RouteSearchResult = { id: number; slug: string; name: string };

export async function searchRoutes(
  q: string,
  limit = 20,
): Promise<RouteSearchResult[]> {
  const query = q.trim();
  if (query.length === 0) return [];

  const rows = await db
    .select({ id: routes.id, slug: routes.slug, name: routes.name })
    .from(routes)
    .where(sql`${routes.name} % ${query}`)
    .orderBy(sql`similarity(${routes.name}, ${query}) DESC`)
    .limit(limit);

  return rows;
}
