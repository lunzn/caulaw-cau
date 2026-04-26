import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@cau-claw/db";

const globalForDb = globalThis as unknown as { pool: Pool | undefined };

function getPool(): Pool {
  if (!globalForDb.pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    globalForDb.pool = new Pool({ connectionString });
  }
  return globalForDb.pool;
}

export const db = drizzle(getPool(), { schema });

export { getPool };
