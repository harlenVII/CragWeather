import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { routes } from "@/lib/schema";

const pool = new Pool({ connectionString: process.env.POSTGRES_URL! });
const db = drizzle(pool, { schema: { routes } });

const ROUTES = [
  { id: 105862922, slug: "the-nose",           name: "The Nose" },
  { id: 105748131, slug: "zodiac",              name: "Zodiac" },
  { id: 105748786, slug: "the-salath-wall",     name: "The Salathe Wall" },
  { id: 105924807, slug: "free-rider",          name: "Free Rider" },
  { id: 106261539, slug: "freerider",           name: "Freerider" },
];

const inserted = await db
  .insert(routes)
  .values(ROUTES)
  .onConflictDoNothing()
  .returning();

console.log(`Seeded ${inserted.length} routes (${ROUTES.length - inserted.length} already existed).`);
await pool.end();
