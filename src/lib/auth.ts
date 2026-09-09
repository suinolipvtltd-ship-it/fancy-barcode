import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/constants";
import { getUserIdFromToken } from "@/lib/session";

/**
 * Read the session cookie, verify its signature/expiry, and load the matching
 * user from the database. Server-only: used by server components and route
 * handlers running in the Node runtime.
 */
export async function getSessionUser(): Promise<{
  id: string;
  email: string;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = await getUserIdFromToken(token);
  if (!userId) return null;

  const sql = getDb();
  const rows =
    await sql`SELECT id, email FROM users WHERE id = ${userId} LIMIT 1`;
  const user = rows[0];
  if (!user) return null;

  return { id: user.id, email: user.email };
}
