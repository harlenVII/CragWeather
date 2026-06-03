import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { routeMeta, routes } from "./schema";

export type RouteSearchResult = {
  id: number;
  slug: string;
  name: string;
  areaPath: string | null;
  grade: string | null;
};

export async function searchRoutes(
  q: string,
  limit = 20,
): Promise<RouteSearchResult[]> {
  const query = q.trim().slice(0, 100);
  if (query.length === 0) return [];

  const rows = await db
    .select({
      id: routes.id,
      slug: routes.slug,
      name: routes.name,
      areaPath: routeMeta.areaPath,
      grade: routeMeta.grade,
    })
    .from(routes)
    .leftJoin(routeMeta, eq(routes.id, routeMeta.id))
    .where(sql`${routes.name} % ${query}`)
    .orderBy(sql`similarity(${routes.name}, ${query}) DESC`)
    .limit(limit);

  return rows;
}
