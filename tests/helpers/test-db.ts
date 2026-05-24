import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "@/lib/schema";

const url = process.env.POSTGRES_URL ?? "postgres://crag:crag@localhost:5432/crag";
const pool = new Pool({ connectionString: url });
export const testDb = drizzle(pool, { schema });

export async function truncateAll() {
  await testDb.execute(sql`TRUNCATE TABLE shared_lists, route_meta, routes RESTART IDENTITY CASCADE`);
}

export async function closeDb() {
  await pool.end();
}
