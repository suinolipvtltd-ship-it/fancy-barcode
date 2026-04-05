import { neon } from "@neondatabase/serverless";

/**
 * Creates a SQL tagged-template function using the Neon serverless driver.
 * Reads the connection string from the DATABASE_URL environment variable.
 *
 * Usage:
 *   import { sql } from "@/lib/db";
 *   const rows = await sql`SELECT * FROM jobs ORDER BY created_at DESC`;
 */
export function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL environment variable is not set. Please configure it in your .env.local file."
    );
  }
  return neon(databaseUrl);
}
