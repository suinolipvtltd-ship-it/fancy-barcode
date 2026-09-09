import { createHash } from "crypto";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60 * 15; // 15 minutes

/** Hash email + IP so raw identifiers are not stored in the table. */
export function normalizeKey(email: string, ip: string | null): string {
  return createHash("sha256")
    .update(`${email}:${ip ?? ""}`)
    .digest("hex");
}

/** Best-effort client IP from the request headers. */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || null;
  return h.get("x-real-ip") ?? null;
}

/** True while the key is inside its lockout window. */
export async function isLoginBlocked(key: string): Promise<boolean> {
  const sql = getDb();
  const rows =
    await sql`SELECT locked_until FROM login_attempts WHERE key = ${key} LIMIT 1`;
  const lockedUntil = rows[0]?.locked_until;
  if (!lockedUntil) return false;
  return new Date(lockedUntil).getTime() > Date.now();
}

/** Record a failed attempt; lock the key after MAX_ATTEMPTS failures. */
export async function recordLoginFailure(key: string): Promise<void> {
  const sql = getDb();
  const lockoutUntil = new Date(Date.now() + LOCKOUT_SECONDS * 1000);
  await sql`
    INSERT INTO login_attempts (key, failed_count, locked_until, updated_at)
    VALUES (${key}, 1, NULL, NOW())
    ON CONFLICT (key) DO UPDATE SET
      failed_count = CASE
        WHEN login_attempts.failed_count + 1 >= ${MAX_ATTEMPTS} THEN 0
        ELSE login_attempts.failed_count + 1
      END,
      locked_until = CASE
        WHEN login_attempts.failed_count + 1 >= ${MAX_ATTEMPTS}
          THEN ${lockoutUntil}
        ELSE NULL
      END,
      updated_at = NOW()
  `;
}

/** Clear the counter after a successful login. */
export async function resetLoginFailures(key: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM login_attempts WHERE key = ${key}`;
}
