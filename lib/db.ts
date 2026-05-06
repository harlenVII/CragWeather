import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

if (!process.env.POSTGRES_URL) {
  throw new Error("POSTGRES_URL is not set");
}

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
export const db = drizzle(pool, { schema });
export { schema };
