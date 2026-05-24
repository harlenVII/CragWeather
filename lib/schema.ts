import { bigint, doublePrecision, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const routes = pgTable(
  "routes",
  {
    // MP IDs are 9-10 digits → fit in JS number safely (well under 2^53).
    id: bigint("id", { mode: "number" }).primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameTrgm: index("routes_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
  }),
);

export const routeMeta = pgTable("route_meta", {
  id: bigint("id", { mode: "number" })
    .primaryKey()
    .references(() => routes.id, { onDelete: "cascade" }),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  areaPath: text("area_path"),
  grade: text("grade"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Route = typeof routes.$inferSelect;
export type RouteMeta = typeof routeMeta.$inferSelect;

export type SavedRouteJson = {
  id: number;
  name: string;
  area: string | null;
  grade: string | null;
};

export const sharedLists = pgTable("shared_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  routes: jsonb("routes").$type<SavedRouteJson[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SharedList = typeof sharedLists.$inferSelect;
